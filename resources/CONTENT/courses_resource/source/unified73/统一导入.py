"""默认仅预检；指定 --apply 才写入本地课程文件。不修改仓库远端。"""
import argparse,copy,json,pathlib,shutil,sys
p=argparse.ArgumentParser();p.add_argument('project',type=pathlib.Path);p.add_argument('--apply',action='store_true');p.add_argument('--backup',type=pathlib.Path);a=p.parse_args()
base=pathlib.Path(__file__).resolve().parent
read=lambda f:json.loads(f.read_text(encoding='utf-8'))
patches=read(base/'73节课程字段补丁.json'); coverage=read(base/'课程覆盖清单.json')
folder=a.project/'resources/CONTENT/courses_resource/courses'
allowed={'title','learningObjective','concept','syntax','parameters','executionSteps','useCase','comparison','commonError','notes','teaching'}
allowed_teach={'problem','codeExplanation','resultExplanation','checkpoints','mergedConcepts','mergeExamples'}
assert len(patches)==73 and len({x['id'] for x in patches})==73
files={}; found={}
for n in range(1,21):
 f=folder/f'ch{n:02d}.json'; j=read(f);files[f]=j
 for k in j['knowledgePoints']:
  if k['id'] in found: sys.exit('重复课程：'+k['id'])
  found[k['id']]=(f,k)
expected={x['id'] for x in coverage}
if set(found)!=expected:sys.exit(f'正式编号冲突，停止：缺失 {sorted(expected-set(found))}；额外 {sorted(set(found)-expected)}')
changed=set()
for patch in patches:
 f,k=found[patch['id']];old=copy.deepcopy(k)
 if set(patch)-allowed-{'id'}:sys.exit('未知补丁字段：'+patch['id'])
 if set(patch.get('teaching',{}))-allowed_teach:sys.exit('未知教学字段：'+patch['id'])
 for key,val in patch.items():
  if key=='id':continue
  if key=='teaching':
   t=k.setdefault('teaching',{})
   if not isinstance(t,dict):sys.exit('教学结构冲突：'+patch['id'])
   t.update(copy.deepcopy(val))
  else:k[key]=copy.deepcopy(val)
 if any(k.get(x)!=old.get(x) for x in set(old)-allowed):sys.exit('保护字段变化：'+patch['id'])
 if k!=old:changed.add(f)
print(f'预检通过：80节正式课，73节目标补丁，{len(changed)}个文件存在变化。第一批7节不修改。')
if not a.apply:print('未写入。请先确认源版本与各批导入说明一致，再显式执行 --apply --backup 路径。');sys.exit(0)
if a.backup is None:sys.exit('写入必须提供 --backup 独立备份目录。')
backup=a.backup.resolve();backup.mkdir(parents=True,exist_ok=False)
for f in changed:shutil.copy2(f,backup/f.name)
try:
 for f in changed:
  tmp=f.with_suffix('.json.import-tmp');tmp.write_text(json.dumps(files[f],ensure_ascii=False,indent=2)+'\n',encoding='utf-8');tmp.replace(f)
except BaseException:
 for f in changed:shutil.copy2(backup/f.name,f)
 raise
print('已写入本地课程文件；备份：',backup)
