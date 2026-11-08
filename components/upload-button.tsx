"use client";

import * as React from "react";
import { UploadCloud } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useUploads } from "@/components/upload-manager";

export function UploadButton({
  parentId,
  label = "Upload",
  variant = "default",
  size = "default",
  className,
}: {
  parentId: string | null;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { queueFiles } = useUploads();

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) queueFiles(event.target.files, parentId);
          event.target.value = "";
        }}
      />
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => inputRef.current?.click()}
      >
        <UploadCloud className="h-4 w-4" />
        {label}
      </Button>
    </>
  );
}
