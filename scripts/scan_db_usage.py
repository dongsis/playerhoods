import re
import json
from pathlib import Path

root = Path(r"C:\Users\dongs\documents\playerhoods")
dump_path = root / "db_dump_public.sql"
raw = dump_path.read_bytes()
# detect UTF-16 by null bytes
if b"\x00" in raw[:200]:
    sql = raw.decode("utf-16", errors="ignore")
else:
    sql = raw.decode("utf-8", errors="ignore")

# tables/views in public
names = set()
for m in re.finditer(r'CREATE\s+(?:TABLE|VIEW|MATERIALIZED\s+VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?"public"\."([^"]+)"', sql, re.I):
    names.add(m.group(1))
for m in re.finditer(r'CREATE\s+(?:TABLE|VIEW|MATERIALIZED\s+VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.([a-zA-Z0-9_]+)', sql, re.I):
    names.add(m.group(1))

# code usage
src_paths = list((root / "src").rglob("*.ts")) + list((root / "src").rglob("*.tsx"))

# routes/pages
app_root = root / "src" / "app"
page_files = list(app_root.rglob("page.tsx"))
# convert file path to route path
routes = []
for p in page_files:
    rel = p.relative_to(app_root).as_posix()  # e.g. groups/[groupId]/page.tsx
    if rel == "page.tsx":
        route = "/"
    else:
        route = "/" + rel.replace("/page.tsx", "")
    # normalize route groups like (auth)
    route = route.replace("/(auth)", "")
    routes.append(route)

route_refs = {r: 0 for r in routes}
route_refs_paths = {r: set() for r in routes}
used_tables = set()
rpc_used = set()
pattern = re.compile(r"\.from\(\s*['\"]([^'\"]+)['\"]\s*\)")
pattern_rpc = re.compile(r"supabase\.rpc\(\s*['\"]([^'\"]+)['\"]")

for p in src_paths:
    text = p.read_text(encoding="utf-8", errors="ignore")
    used_tables.update(m.group(1) for m in pattern.finditer(text))
    rpc_used.update(m.group(1) for m in pattern_rpc.finditer(text))
    # route references (simple string containment)
    for r in routes:
        if r != "/" and r in text:
            route_refs[r] += text.count(r)
            route_refs_paths[r].add(str(p))
        elif r == "/" and ("href=\"/\"" in text or "href='/'" in text or "router.push('/')" in text):
            route_refs[r] += 1
            route_refs_paths[r].add(str(p))

rpc_db = set(
    m.group(1)
    for m in re.finditer(r'FUNCTION\s+"public"\."(rpc_[^"]+)"', sql, re.I)
)

print("ROUTES", json.dumps(sorted(routes), indent=2))
print("ROUTE_REFS", json.dumps({k: route_refs[k] for k in sorted(route_refs)}, indent=2))
print("ROUTE_REF_PATHS", json.dumps({k: sorted(route_refs_paths[k]) for k in sorted(route_refs_paths)}, indent=2))
print("TABLES_VIEWS_COUNT", len(names))
print("USED_TABLES_COUNT", len(used_tables))
print("USED_TABLES", json.dumps(sorted(used_tables), indent=2))
print("UNUSED_TABLES", json.dumps(sorted(names - used_tables), indent=2))
print("USED_TABLES_NOT_IN_DB", json.dumps(sorted(used_tables - names), indent=2))
print("RPC_USED", json.dumps(sorted(rpc_used), indent=2))
print("RPC_DB", json.dumps(sorted(rpc_db), indent=2))
print("RPC_MISSING_IN_DB", json.dumps(sorted(rpc_used - rpc_db), indent=2))
print("RPC_UNUSED_IN_CODE", json.dumps(sorted(rpc_db - rpc_used), indent=2))
