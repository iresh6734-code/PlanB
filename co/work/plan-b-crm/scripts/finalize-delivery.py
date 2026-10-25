"""Add final evidence to already tested packages without rebuilding application code."""
import hashlib
import json
import pathlib
import zipfile

root = pathlib.Path(__file__).resolve().parents[1]
output = root.parents[1] / "outputs"
evidence = {path.name: path.read_bytes() for path in output.iterdir()
    if "v2.1" in path.name.lower() and not path.name.startswith("ENTREGA-SHA256") and path.suffix in [".json", ".txt", ".png", ".md", ".csv", ".html"]}
evidence["RESULTADOS-PRUEBAS-v2.1.md"] = (output / "RESULTADOS-PRUEBAS-v2.1.md").read_bytes()
updates = {"pruebas/" + name: content for name, content in evidence.items()}
for filename in ["Plan-B-CRM-v2.1.zip", "Plan-B-independiente-v2.1.zip"]:
    archive = output / filename
    replacements = dict(updates)
    if filename == "Plan-B-CRM-v2.1.zip":
        for relative in ["IMPLEMENTACION-V2.md"]:
            replacements["source/"+relative]=(root/relative).read_bytes()
        for script in ["verify-package.py", "finalize-delivery.py"]:
            replacements["source/scripts/" + script] = (root / "scripts" / script).read_bytes()
    temporary = archive.with_suffix(".zip.tmp")
    with zipfile.ZipFile(archive) as source, zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=3) as target:
        for entry in source.infolist():
            if entry.filename not in replacements:
                target.writestr(entry, source.read(entry))
        for name, content in replacements.items():
            target.writestr(name, content)
    temporary.replace(archive)
    with zipfile.ZipFile(archive) as final:
        assert final.testzip() is None
        assert len(final.namelist()) == len(set(final.namelist()))
        assert final.read("runtime.mjs") == (root / "build" / "runtime.mjs").read_bytes()
        assert final.read("drill.mjs") == (root / "build" / "drill.mjs").read_bytes()
        if filename == "Plan-B-CRM-v2.1.zip":
            assert final.read("server.mjs") == (root / "build" / "server.mjs").read_bytes()
        assert "pruebas/RESULTADOS-PRUEBAS-v2.1.md" in final.namelist()
manifest = {path.name: {"bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
    for path in output.glob("*-v2.1.zip")}
(output / "ENTREGA-SHA256-v2.1.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print(json.dumps(manifest))
