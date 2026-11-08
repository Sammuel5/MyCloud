import { randomBytes } from "node:crypto";

const secret = randomBytes(48).toString("base64url");
console.log(secret);
console.error(
  "\nCopy the value above into .env.local as AUTH_SECRET. Never reuse it elsewhere or commit it."
);
