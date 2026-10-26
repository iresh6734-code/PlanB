"""Reuse the Windows runtime of the checksum-verified v2 delivery, without fetching executables."""
import hashlib
import json
import pathlib
import zipfile

root = pathlib.Path(__file__).resolve().parents[1]
output = root.parents[1] / "outputs"
archive = output / "Plan-B-CRM-v2.zip"
manifest = json.loads((output / "ENTREGA-SHA256-v2.json").read_text(encoding="utf-8"))
assert hashlib.sha256(archive.read_bytes()).hexdigest() == manifest[archive.name]["sha256"], "La entrega v2 no coincide con su manifiesto."
with zipfile.ZipFile(archive) as source:
    old = json.loads(source.read("source/package-lock.json"))
    current = json.loads((root / "package-lock.json").read_text(encoding="utf-8"))
    old["version"] = current["version"]
    old["packages"][""]["version"] = current["packages"][""]["version"]
    assert old == current, "Las dependencias cambiaron; prepara un runtime nuevo con su integridad verificada."
    target = root / "runtime-assets"
    target.mkdir(exist_ok=True)
    for name in source.namelist():
        if name.endswith("/") or not (name == "node.exe" or name.startswith("node_modules/")):
            continue
        destination = target / name
        destination.resolve().relative_to(target.resolve())
        content = source.read(name)
        if destination.exists():
            assert destination.read_bytes() == content, "Ya existe un archivo distinto en runtime-assets. Consérvalo y revisa su procedencia."
        else:
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(content)
print("Runtime Windows v2 verificado y preparado; dependencias coincidentes con el lockfile actual.")
