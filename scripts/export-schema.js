import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const files = [
  "database/schema.sql",
  ...readdirSync("database/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => "database/migrations/" + f),
];
writeFileSync(
  "database/full-schema.sql",
  files
    .map((f) => "-- Source: " + f + "\n" + readFileSync(f, "utf8"))
    .join("\n\n"),
);
console.log("Exported database/full-schema.sql");
