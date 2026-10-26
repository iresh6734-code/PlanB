"""Native acceptance of CMD/launcher reuse and relocation, with isolated synthetic ZIPs."""
import json
import os
import pathlib
import signal
import shutil
import subprocess
import tempfile
import time
import urllib.request
import zipfile

root = pathlib.Path(__file__).resolve().parents[1]
version = json.loads((root / "package.json").read_text(encoding="utf-8"))["version"]
output = pathlib.Path(os.environ.get("PLANB_OUTPUT_DIR",root / "delivery" / ("v"+version))).resolve()
scratch = root / "tests" / ".tmp"
scratch.mkdir(parents=True,exist_ok=True)
assert os.name == "nt", "Esta aceptación necesita Windows."
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

def launch(folder):
    env = {k:v for k,v in os.environ.items() if not any(word in k.upper() for word in ["TOKEN","SECRET","API_KEY","NODE_OPTIONS","PLANB_"])}
    env["PLANB_LAUNCH_NO_BROWSER"]="1"
    result=subprocess.run(["cmd.exe","/d","/c",str(folder / "ABRIR PLAN B.cmd")],cwd=folder,env=env,capture_output=True,text=True,timeout=90,creationflags=subprocess.CREATE_NO_WINDOW)
    assert result.returncode==0,result.stdout+result.stderr
    endpoint=json.loads((folder / "data" / ".endpoint.json").read_text(encoding="utf-8"))
    with opener.open(endpoint["url"]+"/api/health",timeout=5) as response:
        health=json.load(response)
    assert health["ok"] and health["version"]==version and health["instanceId"]==endpoint["instanceId"]
    assert endpoint["url"].startswith("http://127.0.0.1:")
    assert json.loads((folder / "data" / ".planb-key").read_text(encoding="utf-8"))["kind"]=="dpapi"
    return endpoint

def stop(endpoint):
    os.kill(endpoint["pid"],signal.SIGTERM)
    for _ in range(50):
        try:
            with opener.open(endpoint["url"]+"/api/health",timeout=.2):pass
        except OSError:
            time.sleep(.3)
            return
        time.sleep(.1)
    raise AssertionError("El proceso de prueba no se detuvo.")

results=[]
for filename in ["Plan-B-CRM-v"+version+".zip","Plan-B-independiente-v"+version+".zip"]:
    with tempfile.TemporaryDirectory(prefix="launcher-",dir=scratch) as temporary:
        temp=pathlib.Path(temporary).resolve()
        first=temp / "carpeta con espacios"; moved=temp / "carpeta trasladada"
        first.mkdir()
        with zipfile.ZipFile(output / filename) as archive:
            for name in archive.namelist():(first / name).resolve().relative_to(first)
            archive.extractall(first)
        endpoint=launch(first)
        try:
            repeated=launch(first)
            assert repeated==endpoint,"El segundo arranque creó otra instancia."
        finally:stop(endpoint)
        first.relative_to(temp);moved.relative_to(temp)
        shutil.move(str(first),str(moved))
        relocated=launch(moved)
        try:assert relocated["instanceId"]==endpoint["instanceId"]
        finally:stop(relocated)
        results.append({"package":filename,"passed":True,"cmdExecuted":True,"bundledNode":True,"dpapi":True,"reuseSameInstance":True,"restartAfterMove":True,"browserOpeningSuppressedForTest":True})
(output / ("pruebas-iniciadores-v"+version+".json")).write_text(json.dumps(results,indent=2),encoding="utf-8")
print(json.dumps(results))
