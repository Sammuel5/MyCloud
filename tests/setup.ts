import path from "node:path";
import os from "node:os";

process.env.AUTH_SECRET =
  "test-only-auth-secret-with-more-than-thirty-two-characters";
process.env.AUTH_URL = "http://127.0.0.1:3000";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/mycloud-test";
process.env.MYCLOUD_STORAGE_PATH = path.join(os.tmpdir(), "mycloud-vitest-storage");
