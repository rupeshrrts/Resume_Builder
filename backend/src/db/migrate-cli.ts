import { createDb } from "./index";
import { migrate } from "./migrate";

const db = await createDb();
const applied = await migrate(db);
console.log(applied.length ? `Applied: ${applied.join(", ")}` : `Database (${db.kind}) is up to date.`);
await db.close();
