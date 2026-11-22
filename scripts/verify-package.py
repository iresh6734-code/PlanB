"""Execute the delivered ZIP, edit without external network, restart after moving it."""
import argparse
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
VERSION = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
TAG = "v" + VERSION
OUTPUT = pathlib.Path(os.environ.get("PLANB_OUTPUT_DIR", ROOT / "delivery" / TAG)).resolve()
SCRATCH = ROOT / "tests" / ".tmp"
SCRATCH.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--node", type=pathlib.Path, help="Runtime local para pruebas de lógica del ZIP; no acredita el node.exe incluido ni DPAPI de Windows.")
args = parser.parse_args()
if os.name != "nt" and args.node is None:
    parser.error("La aceptación nativa requiere Windows. Usa --node para una comprobación de lógica separada en Linux.")
if args.node is not None:
    args.node = args.node.resolve(strict=True)
NATIVE_WINDOWS = os.name == "nt" and args.node is None
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
    if not NATIVE_WINDOWS:
        env["NODE_ENV"] = "test"
    log = (folder / "test-run.log").open("w", encoding="utf-8")
    process = subprocess.Popen([str(args.node or folder / "node.exe"), "--require", str(GUARD), entry],
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
        binary = source.read("node.exe")
        assert binary[:2] == b"MZ" and len(binary) >= 64, "node.exe no es un ejecutable Windows."
        pe = int.from_bytes(binary[60:64], "little")
        assert 64 <= pe <= len(binary) - 4 and binary[pe:pe+4] == b"PE\0\0"
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
for filename, runtime in [(f"Plan-B-CRM-v{VERSION}.zip", False), (f"Plan-B-independiente-v{VERSION}.zip", True)]:
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
            if not runtime and not state["ready"]:
                api("/import/fixture", {"profile": "agency"}, "POST")
                api("/generate", {"mode": "demo"}, "POST")
                api("/activate", {"reviewed": True}, "POST")
                api("/v2/services", {"enabled": False}, "POST")
                state = api("/state")
            assert state["ready"] and state["disconnected"] and state["runtime"] == runtime
            assert "aiConfigured" not in state and not state["hubspotConfigured"]
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
for result in results:
    result["platform"] = os.name
    result["bundledWindowsRuntimeExecuted"] = NATIVE_WINDOWS
    result["windowsDpapiVerified"] = NATIVE_WINDOWS
    if not NATIVE_WINDOWS:
        result["limitations"] = ["Prueba de lógica con Node de Linux y claves de test. No ejecuta el node.exe incluido ni acredita DPAPI o los iniciadores Windows.",
            "La exportación cifrada generada en esta ejecución contiene el runtime de Linux; no es una entrega Windows."]
report_name = f"pruebas-paquetes-v{VERSION}.json" if NATIVE_WINDOWS else f"pruebas-paquetes-v{VERSION}-linux.json"
OUTPUT.joinpath(report_name).write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
print(json.dumps(results, ensure_ascii=False))
