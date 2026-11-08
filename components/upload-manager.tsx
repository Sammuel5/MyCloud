"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, RotateCcw, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ApiClientError, errorMessage } from "@/lib/api-client";
import { formatBytesClient } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { UploadCompleteResponse, UploadInitResponse } from "@/lib/types";

type UploadState =
  | "queued"
  | "hashing"
  | "uploading"
  | "finalizing"
  | "success"
  | "error"
  | "cancelled";

export interface UploadTask {
  id: string;
  filename: string;
  size: number;
  parentId: string | null;
  progress: number;
  state: UploadState;
  error?: string;
  uploadId?: string;
  duplicateOf?: string | null;
}

interface Job {
  taskId: string;
  file: File;
  parentId: string | null;
}

interface UploadContextValue {
  tasks: UploadTask[];
  activeCount: number;
  queueFiles: (files: FileList | File[], parentId: string | null) => void;
  retry: (taskId: string) => void;
  cancel: (taskId: string) => void;
  clearFinished: () => void;
}

const UploadContext = React.createContext<UploadContextValue | null>(null);

// A single large file used to be uploaded one chunk at a time. On a normal
// Wi-Fi link that leaves most of the available bandwidth idle. Four
// outstanding chunk requests keep the connection busy without exhausting
// memory on phones.
const UPLOAD_CHUNK_CONCURRENCY = 4;

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function fingerprintFor(file: File): Promise<string> {
  const value = `${file.name}|${file.size}|${file.lastModified}|${file.type}|mycloud-v1`;
  if (typeof crypto === "undefined" || !crypto.subtle) return value;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseError(response: Response): Promise<ApiClientError> {
  let message = response.statusText || "Upload failed";
  let code = "UPLOAD_FAILED";
  try {
    const payload = (await response.json()) as { error?: string; code?: string };
    message = payload.error || message;
    code = payload.code || code;
  } catch {
    // Keep status text for non-JSON proxy errors.
  }
  return new ApiClientError(message, response.status, code);
}

async function putChunk(
  uploadId: string,
  index: number,
  blob: Blob,
  signal: AbortSignal
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      const response = await fetch(`/api/uploads/${uploadId}/chunks/${index}`, {
        method: "PUT",
        body: blob,
        credentials: "same-origin",
        headers: { "Content-Type": "application/octet-stream" },
        signal,
      });
      if (!response.ok) throw await parseError(response);
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      lastError = error;
      if (attempt < 3) await sleep(800 * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Chunk upload failed");
}

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = React.useState<UploadTask[]>([]);
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const tasksRef = React.useRef<UploadTask[]>([]);
  const queueRef = React.useRef<Job[]>([]);
  const runningRef = React.useRef(0);
  const controllersRef = React.useRef(new Map<string, AbortController>());
  const jobFilesRef = React.useRef(new Map<string, { file: File; parentId: string | null }>());

  React.useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const patchTask = React.useCallback((taskId: string, patch: Partial<UploadTask>) => {
    setTasks((previous) =>
      previous.map((task) => (task.id === taskId ? { ...task, ...patch } : task))
    );
  }, []);

  const removeTask = React.useCallback((taskId: string) => {
    setTasks((previous) => previous.filter((task) => task.id !== taskId));
    controllersRef.current.delete(taskId);
    jobFilesRef.current.delete(taskId);
  }, []);

  const runJob = React.useCallback(
    async (job: Job): Promise<void> => {
      const controller = new AbortController();
      controllersRef.current.set(job.taskId, controller);
      const { signal } = controller;
      const taskId = job.taskId;
      try {
        patchTask(taskId, { state: "hashing", progress: 0, error: undefined });
        const fingerprint = await fingerprintFor(job.file);
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        patchTask(taskId, { state: "uploading" });

        const initResponse = await fetch("/api/uploads", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          signal,
          body: JSON.stringify({
            filename: job.file.name,
            size: job.file.size,
            mimeType: job.file.type || "application/octet-stream",
            parentId: job.parentId,
            fingerprint,
          }),
        });
        if (!initResponse.ok) throw await parseError(initResponse);
        const init = (await initResponse.json()) as UploadInitResponse;
        patchTask(taskId, { uploadId: init.uploadId });

        const received = new Set(init.receivedChunks);
        let completedBytes = 0;
        for (const index of init.receivedChunks) {
          const start = index * init.chunkSize;
          completedBytes += Math.min(init.chunkSize, job.file.size - start);
        }

        const reportProgress = () => {
          patchTask(taskId, {
            progress:
              job.file.size === 0
                ? 90
                : Math.min(90, (completedBytes / job.file.size) * 90),
          });
        };
        reportProgress();

        const uploadIndices = async (
          uploadId: string,
          chunkSize: number,
          indices: number[]
        ): Promise<void> => {
          let cursor = 0;
          let failure: unknown = null;
          const workerCount = Math.min(UPLOAD_CHUNK_CONCURRENCY, indices.length);
          const worker = async (): Promise<void> => {
            while (!failure) {
              if (signal.aborted) {
                failure = new DOMException("Aborted", "AbortError");
                return;
              }
              const position = cursor;
              cursor += 1;
              if (position >= indices.length) return;
              const index = indices[position];
              const start = index * chunkSize;
              const end = Math.min(job.file.size, start + chunkSize);
              try {
                await putChunk(uploadId, index, job.file.slice(start, end), signal);
              } catch (error) {
                failure = error;
                return;
              }
              completedBytes += end - start;
              reportProgress();
            }
          };
          await Promise.all(Array.from({ length: workerCount }, () => worker()));
          if (failure) throw failure;
        };

        const missing: number[] = [];
        for (let index = 0; index < init.totalChunks; index++) {
          if (!received.has(index)) missing.push(index);
        }
        await uploadIndices(init.uploadId, init.chunkSize, missing);

        patchTask(taskId, { state: "finalizing", progress: 92 });
        let completeResponse = await fetch(`/api/uploads/${init.uploadId}/complete`, {
          method: "POST",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal,
        });
        if (
          !completeResponse.ok &&
          (completeResponse.status === 409 || completeResponse.status === 410)
        ) {
          // One recovery pass: refresh status and upload anything the server
          // rejected, then complete again.
          const statusResponse = await fetch(`/api/uploads/${init.uploadId}`, {
            credentials: "same-origin",
            cache: "no-store",
            signal,
          });
          if (statusResponse.ok) {
            const status = (await statusResponse.json()) as {
              receivedChunks: number[];
              totalChunks: number;
              chunkSize: number;
            };
            const present = new Set(status.receivedChunks);
            const missingAfterRecovery: number[] = [];
            for (let index = 0; index < status.totalChunks; index++) {
              if (!present.has(index)) missingAfterRecovery.push(index);
            }
            await uploadIndices(init.uploadId, status.chunkSize, missingAfterRecovery);
            completeResponse = await fetch(`/api/uploads/${init.uploadId}/complete`, {
              method: "POST",
              credentials: "same-origin",
              headers: { Accept: "application/json" },
              signal,
            });
          }
        }
        if (!completeResponse.ok) throw await parseError(completeResponse);
        const completed = (await completeResponse.json()) as UploadCompleteResponse;
        patchTask(taskId, {
          state: "success",
          progress: 100,
          duplicateOf: completed.duplicateOf?.name || null,
        });
        window.dispatchEvent(
          new CustomEvent("mycloud:changed", { detail: { parentId: job.parentId } })
        );
        setTimeout(() => {
          const current = tasksRef.current.find((task) => task.id === taskId);
          if (current?.state === "success") removeTask(taskId);
        }, 8000);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          patchTask(taskId, { state: "cancelled", error: "Upload cancelled" });
        } else {
          patchTask(taskId, { state: "error", error: errorMessage(error) });
        }
      } finally {
        controllersRef.current.delete(taskId);
      }
    },
    [patchTask, removeTask]
  );

  const drain = React.useCallback(() => {
    while (runningRef.current < 2 && queueRef.current.length > 0) {
      const job = queueRef.current.shift();
      if (!job) break;
      runningRef.current += 1;
      void runJob(job).finally(() => {
        runningRef.current -= 1;
        drain();
      });
    }
  }, [runJob]);

  const queueFiles = React.useCallback(
    (files: FileList | File[], parentId: string | null) => {
      const list = Array.from(files).filter((file) => file.size >= 0);
      if (list.length === 0) return;
      const newTasks: UploadTask[] = [];
      for (const file of list) {
        const id = randomId();
        newTasks.push({
          id,
          filename: file.name,
          size: file.size,
          parentId,
          progress: 0,
          state: "queued",
        });
        jobFilesRef.current.set(id, { file, parentId });
        queueRef.current.push({ taskId: id, file, parentId });
      }
      setTasks((previous) => [...newTasks, ...previous]);
      setPanelOpen(true);
      setCollapsed(false);
      setTimeout(drain, 0);
    },
    [drain]
  );

  const retry = React.useCallback(
    (taskId: string) => {
      const stored = jobFilesRef.current.get(taskId);
      const task = tasksRef.current.find((entry) => entry.id === taskId);
      if (!stored || !task) return;
      controllerAbort(taskId);
      patchTask(taskId, { state: "queued", progress: 0, error: undefined });
      queueRef.current.push({ taskId, file: stored.file, parentId: stored.parentId });
      setTimeout(drain, 0);
    },
    [drain, patchTask]
  );

  const cancel = React.useCallback(
    (taskId: string) => {
      const controller = controllersRef.current.get(taskId);
      controller?.abort();
      queueRef.current = queueRef.current.filter((job) => job.taskId !== taskId);
      const task = tasksRef.current.find((entry) => entry.id === taskId);
      if (task && ["queued", "hashing", "uploading", "finalizing"].includes(task.state)) {
        patchTask(taskId, { state: "cancelled", error: "Upload cancelled" });
      }
      if (task?.uploadId) {
        void fetch(`/api/uploads/${task.uploadId}`, {
          method: "DELETE",
          credentials: "same-origin",
          keepalive: true,
        }).catch(() => undefined);
      }
    },
    [patchTask]
  );

  const clearFinished = React.useCallback(() => {
    setTasks((previous) =>
      previous.filter((task) => !["success", "error", "cancelled"].includes(task.state))
    );
  }, []);

  function controllerAbort(taskId: string) {
    controllersRef.current.get(taskId)?.abort();
  }

  const activeCount = tasks.filter((task) =>
    ["queued", "hashing", "uploading", "finalizing"].includes(task.state)
  ).length;

  const unfinished = tasks.filter(
    (task) => !["success", "cancelled"].includes(task.state)
  ).length;

  return (
    <UploadContext.Provider
      value={{ tasks, activeCount, queueFiles, retry, cancel, clearFinished }}
    >
      {children}
      {panelOpen && tasks.length > 0 ? (
        <div className="fixed bottom-4 right-4 z-40 w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-xl border border-border bg-card shadow-float">
          <button
            type="button"
            className="flex w-full items-center gap-3 border-b border-border bg-muted/40 px-4 py-3 text-left"
            onClick={() => setCollapsed((value) => !value)}
            aria-expanded={!collapsed}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UploadCloud className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">
                {activeCount > 0 ? `Uploading ${activeCount} item${activeCount === 1 ? "" : "s"}` : "Uploads"}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {unfinished > 0
                  ? "Transfers continue while you browse"
                  : "All transfers finished"}
              </span>
            </span>
            {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {!collapsed ? (
            <>
              <div className="max-h-72 overflow-y-auto scrollbar-thin">
                {tasks.slice(0, 8).map((task) => (
                  <div key={task.id} className="border-b border-border/60 px-4 py-3 last:border-0">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        {task.state === "success" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : task.state === "error" ? (
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        ) : (
                          <UploadCloud className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{task.filename}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {task.state === "success"
                            ? task.duplicateOf
                              ? `Uploaded. Duplicate of “${task.duplicateOf}”`
                              : "Uploaded"
                            : task.state === "error" || task.state === "cancelled"
                              ? task.error || "Upload stopped"
                              : task.state === "finalizing"
                                ? "Verifying and saving…"
                                : `${formatBytesClient(task.size)} · ${Math.round(task.progress)}%`}
                        </p>
                        {["queued", "hashing", "uploading", "finalizing"].includes(task.state) ? (
                          <Progress value={task.progress} className="mt-2 h-1.5" />
                        ) : null}
                      </div>
                      {["success", "cancelled"].includes(task.state) ? (
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:bg-muted"
                          onClick={() => removeTask(task.id)}
                          aria-label={`Remove ${task.filename} from list`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : task.state === "error" ? (
                        <>
                          <button
                            type="button"
                            className="rounded p-1 text-muted-foreground hover:bg-muted"
                            onClick={() => retry(task.id)}
                            aria-label={`Retry ${task.filename}`}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="rounded p-1 text-muted-foreground hover:bg-muted"
                            onClick={() => removeTask(task.id)}
                            aria-label={`Remove ${task.filename}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:bg-muted"
                          onClick={() => cancel(task.id)}
                          aria-label={`Cancel ${task.filename}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
                <span className="text-xs text-muted-foreground">
                  {tasks.length > 8 ? `+${tasks.length - 8} more` : "Secure chunked upload"}
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={clearFinished} className={cn("h-7 text-xs")}>
                    Clear finished
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setPanelOpen(false)}
                    aria-label="Hide upload panel"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </UploadContext.Provider>
  );
}

export function useUploads(): UploadContextValue {
  const context = React.useContext(UploadContext);
  if (!context) throw new Error("useUploads must be used inside UploadProvider");
  return context;
}
