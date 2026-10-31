import { runCalibration } from "../modules/calibration/index.ts";
import { openDatabase } from "../platform/open.ts";

const db = await openDatabase();
console.log(await runCalibration(db, Date.now()));
await db.close();
