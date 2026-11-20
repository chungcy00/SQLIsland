import pathlib,subprocess,sys
base=pathlib.Path(__file__).resolve().parent/'分批原始资源'
failed=[]
for folder in sorted(base.iterdir()):
 if not folder.is_dir():continue
 r=subprocess.run([sys.executable,str(folder/'复验.py')],cwd=folder)
 if r.returncode:failed.append(folder.name)
print('失败批次：',failed)
sys.exit(bool(failed))
