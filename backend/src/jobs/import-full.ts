import "dotenv/config";
import { prisma } from "../lib/db.js";
import { importFullFromSupplier } from "./importer.js";

function getArg(name: string) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

const supplierId = getArg("supplier-id");
const supplierCode = getArg("supplier-code");

if (!supplierId && !supplierCode) {
  console.error("Usage: import-full --supplier-id=<id> OR --supplier-code=<code>");
  process.exit(1);
}

const supplier = supplierId
  ? await prisma.supplier.findUnique({ where: { id: supplierId } })
  : await prisma.supplier.findUnique({ where: { code: supplierCode! } });

if (!supplier) {
  console.error("Supplier not found");
  process.exit(1);
}

const result = await importFullFromSupplier(supplier);
console.log(result);
process.exit(0);
