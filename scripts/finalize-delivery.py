"""Verify immutable delivery hashes; save acceptance evidence beside the tested ZIPs."""
import hashlib
import json
import os
import pathlib
import zipfile

root = pathlib.Path(__file__).resolve().parents[1]
version = json.loads((root / "package.json").read_text(encoding="utf-8"))["version"]
tag = "v" + version
output = pathlib.Path(os.environ.get("PLANB_OUTPUT_DIR", root / "delivery" / tag)).resolve()
manifest_file = output / ("ENTREGA-SHA256-" + tag + ".json")
manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
for filename, expected in manifest["files"].items():
    archive = output / filename
    actual = hashlib.sha256(archive.read_bytes()).hexdigest()
    assert actual == expected["sha256"] and archive.stat().st_size == expected["bytes"], filename
    with zipfile.ZipFile(archive) as package:
        assert package.testzip() is None
        assert len(package.namelist()) == len(set(package.namelist()))
        for module in ["runtime", "drill"] + (["server"] if filename.startswith("Plan-B-CRM-") else []):
            assert package.read(module + ".mjs") == (root / "build" / (module + ".mjs")).read_bytes()
reports = {}
for report in output.glob("pruebas-*.json"):
    reports[report.name] = hashlib.sha256(report.read_bytes()).hexdigest()
summary = {"version":version,"immutablePackagesVerified":True,"manifest":manifest_file.name,"evidence":reports}
(output / ("ACEPTACION-" + tag + ".json")).write_text(json.dumps(summary,indent=2),encoding="utf-8")
print(json.dumps(summary))
