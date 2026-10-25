"""Execute the delivered ZIP, edit without external network, restart after moving it."""
import json
import os
import pathlib
import re
import shutil
import subprocess
import tempfile
import time
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUTPUT = ROOT.parents[1] / "outputs"
SCRATCH = ROOT / "tests" / ".tmp"
SCRATCH.mkdir(parents=True, exist_ok=True)
BASE = "http://127.0.0.1:4347"
GUARD = ROOT / "scripts" / "block-external.cjs"
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
def api(path, payload=None, method=None):
    request = urllib.request.Request(BASE + "/api" + path,
        data=None if payload is None else json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"}, method=method)
    with opener.open(request, timeout=60) as response:
        return json.load(response)

def launch(folder, entry):
    env = {key: value for key, value in os.environ.items() if not any(word in key.upper() for word in ["API_KEY", "HUBSPOT", "PLANB_", "NODE_OPTIONS"])}
    env["PLANB_PORT"] = "4347"
    log = (folder / "test-run.log").open("w", encoding="utf-8")
    process = subprocess.Popen([str(folder / "node.exe"), "--require", str(GUARD), entry],
        cwd=folder, env=env, stdout=log, stderr=log, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    try:
        for _ in range(100):
            if process.poll() is not None:
                raise AssertionError("Servidor detenido: " + (folder / "test-run.log").read_text())
            try:
                state = api("/state")
                return process, log, state
            except OSError:
                time.sleep(.15)
        raise AssertionError("El servidor no arrancó.")
    except BaseException:
        process.terminate(); process.wait(timeout=10); log.close(); raise

def stop(process, log, folder):
    process.terminate(); process.wait(timeout=10); log.close()
    assert "EXTERNAL_" not in (folder / "test-run.log").read_text(), "Se intentó una conexión externa."

def inspect_archive(archive, runtime):
    with zipfile.ZipFile(archive) as source:
        names = source.namelist()
        assert source.testzip() is None
        assert "node.exe" in names and "dist/index.html" in names and "ABRIR PLAN B.cmd" in names
        assert not any(pathlib.PurePosixPath(name).name.startswith((".env", ".ai.local", ".key-setup", ".planb-key", ".instance")) for name in names)
        assert not any(".sqlite" in name for name in names)
        assert not any(".." in pathlib.PurePosixPath(name).parts or name.startswith(("/", "\\")) for name in names)
        code = source.read("runtime.mjs").decode()
        for forbidden in ["api.hubapi.com", "chat/completions", "OPENAI_API_KEY", "registerGenerator", "ProviderSettings"]:
            assert forbidden not in code, forbidden
        if runtime:
            assert "server.mjs" not in names and "continuity.seed.json" in names
        for name in names:
            if name.endswith((".mjs", ".json", ".js", ".ts", ".tsx", ".md")) and not name.startswith("node_modules/"):
                assert not re.search(rb"sk-proj-[A-Za-z0-9_-]{24,}", source.read(name)), "Posible secreto: " + name
    return len(names)

results = []
for filename, runtime in [("Plan-B-CRM-v2.1.zip", False), ("Plan-B-independiente-v2.1.zip", True)]:
    print("Verificando " + filename, flush=True)
    archive = OUTPUT / filename
    entries = inspect_archive(archive, runtime)
    with tempfile.TemporaryDirectory(prefix="zip-", dir=SCRATCH) as temporary:
        temporary = pathlib.Path(temporary).resolve()
        initial, moved = temporary / "primera carpeta", temporary / "otra carpeta"
        initial.mkdir()
        with zipfile.ZipFile(archive) as source:
            for name in source.namelist():
                (initial / name).resolve().relative_to(initial)
            source.extractall(initial)
        entry = "runtime.mjs" if runtime else "server.mjs"
        process, log, state = launch(initial, entry)
        try:
            assert state["ready"] and state["disconnected"] and state["runtime"] == runtime
            assert not state["aiConfigured"] and not state["hubspotConfigured"]
            api("/records/contacts/contact-1", {"values": {"phone": "600 999 888"}}, "PATCH")
            api("/records/deals/deal-1", {"values": {"dealstage": "proposal"}}, "PATCH")
            task = api("/records/tasks", {"values": {"subject": "Creada desde el ZIP sin red", "due_date": "2026-11-12", "status": "pending"}}, "POST")["record"]
            assert api("/probe", {}, "POST")["passed"]
            assert api("/state")["changes"] == 3
            bundle = api("/export/bundle")
            assert len(bundle["records"]) == 63 and len(bundle["snapshot"]["links"]) == 84
            # Isolated drill must leave the operational workspace unchanged.
            job = api("/v2/drills", {}, "POST")
            for _ in range(150):
                status = api("/v2/continuity")
                current = next(item for item in status["jobs"] if item["id"] == job["id"])
                if current["status"] not in ["queued", "running"]:
                    break
                time.sleep(.2)
            assert current["status"] == "succeeded", current
            assert status["reports"][0]["passed"] and len(status["reports"][0]["checks"]) == 5
            assert api("/state")["changes"] == 3
            assert api("/records")["records"] == bundle["records"]
            encrypted = api("/v2/export/encrypted", {"password": "solo-prueba-de-recuperacion"}, "POST")
            assert encrypted["format"] == "planb-encrypted-v2" and "records" not in encrypted
            if not runtime:
                portable_bundle = bundle
                request = urllib.request.Request(BASE + "/api/v2/export/package",
                    data=json.dumps({"password": "solo-prueba-de-recuperacion"}).encode(),
                    headers={"Content-Type": "application/json"}, method="POST")
                print("Exportando paquete cifrado desde la aplicación...", flush=True)
                export_started = time.monotonic()
                with opener.open(request, timeout=600) as response:
                    portable_zip = response.read()
                portable_export_ms = round((time.monotonic() - export_started) * 1000)
        finally:
            stop(process, log, initial)
        initial.relative_to(temporary); moved.relative_to(temporary)
        shutil.move(str(initial), str(moved))
        process, log, state = launch(moved, entry)
        try:
            assert state["changes"] == 3 and state["ready"]
            records = api("/records")["records"]
            by_id = {record["entity"] + ":" + record["id"]: record for record in records}
            assert by_id["contacts:contact-1"]["values"]["phone"] == "600 999 888"
            assert by_id["deals:deal-1"]["values"]["dealstage"] == "proposal"
            assert by_id["tasks:" + task["id"]]["values"]["subject"] == "Creada desde el ZIP sin red"
            if runtime:
                for route in ["/generate", "/import/hubspot", "/v2/return/preview"]:
                    try:
                        api(route, {}, "POST")
                        raise AssertionError("El runtime expuso una ruta del generador: " + route)
                    except urllib.error.HTTPError as error:
                        assert error.code == 404
        finally:
            stop(process, log, moved)
    results.append({"package": filename, "passed": True, "entries": entries, "records": 63, "changes": 3,
        "restartAfterMove": True, "externalNetworkBlocked": True, "secretsExcluded": True})
with tempfile.TemporaryDirectory(prefix="encrypted-", dir=SCRATCH) as temporary:
    import io
    destination = pathlib.Path(temporary).resolve()
    with zipfile.ZipFile(io.BytesIO(portable_zip)) as source:
        assert "continuity.encrypted.json" in source.namelist() and "continuity.seed.json" not in source.namelist()
        for name in source.namelist():
            (destination / name).resolve().relative_to(destination)
        source.extractall(destination)
    process, log, state = launch(destination, "runtime.mjs")
    try:
        assert not state["ready"]
        file = (destination / "continuity.encrypted.json").read_text(encoding="utf-8")
        try:
            api("/v2/restore", {"file": file, "password": "incorrecta"}, "POST")
            raise AssertionError("Se admitió una contraseña incorrecta.")
        except urllib.error.HTTPError as error:
            assert error.code == 422 and not api("/state")["ready"]
        api("/v2/restore", {"file": file, "password": "solo-prueba-de-recuperacion"}, "POST")
        assert api("/state")["ready"] and api("/state")["changes"] == 3
        assert api("/records")["records"] == portable_bundle["records"]
    finally:
        stop(process, log, destination)
results.append({"package": "exportado mediante API", "passed": True, "encryptedPortableRestore": True,
    "wrongPasswordRejected": True, "externalNetworkBlocked": True, "credentialsRequired": False, "exportDurationMs": portable_export_ms})
OUTPUT.joinpath("pruebas-paquetes-v2.1.json").write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
print(json.dumps(results, ensure_ascii=False))
