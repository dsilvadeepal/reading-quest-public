from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
skip={"node_modules",".git","dist",".local"}
forbidden=[r"rylan",r"luffy",r"replit\.app",r"images-na\.ssl-images-amazon",r"/Users/",r"gh[pousr]_[A-Za-z0-9]{20,}",r"-----BEGIN .*PRIVATE KEY-----",r"sk-[A-Za-z0-9]{24,}"]
fail=[]
for path in root.rglob("*"):
 if not path.is_file() or any(x in skip for x in path.relative_to(root).parts): continue
 if path.name=="check_public_export.py": continue
 if path.suffix in {".sqlite",".db",".bundle"} or path.name.startswith((".env",".dev.vars")):fail.append(str(path.relative_to(root)))
 if path.suffix in {".jpg",".png"}:continue
 try:text=path.read_text()
 except UnicodeDecodeError:fail.append(str(path.relative_to(root)));continue
 if any(re.search(pattern,text,re.I) for pattern in forbidden):fail.append(str(path.relative_to(root)))
assert not fail, "Review required: "+", ".join(fail)
print("Public-export checks passed.")
