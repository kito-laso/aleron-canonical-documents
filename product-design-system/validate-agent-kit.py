#!/usr/bin/env python3
import copy, json, pathlib, re, subprocess, sys
ROOT = pathlib.Path(__file__).resolve().parent
errors=[]
required=['manifest.json','AGENTS.md','tokens.json','tokens.css','components.json','components.css','acceptance.json','prototype-starter.html','air-audit.js','copy-audit.js','index.html','schemas/manifest.schema.json','schemas/tokens.schema.json','schemas/components.schema.json','schemas/acceptance.schema.json']
for name in required:
    if not (ROOT/name).is_file(): errors.append(f'missing {name}')

def load(name):
    try: return json.loads((ROOT/name).read_text())
    except Exception as exc: errors.append(f'{name}: {exc}'); return {}
manifest=load('manifest.json'); tokens=load('tokens.json'); components=load('components.json'); acceptance=load('acceptance.json')
schemas={name:load(f'schemas/{name}.schema.json') for name in ['manifest','tokens','components','acceptance']}

def schema_errors(value, schema, root=None, path='$'):
    root = root or schema
    if '$ref' in schema:
        target=root
        for part in schema['$ref'].removeprefix('#/').split('/'):
            target=target[part.replace('~1','/').replace('~0','~')]
        return schema_errors(value,target,root,path)
    found=[]
    if 'anyOf' in schema and not any(not schema_errors(value,part,root,path) for part in schema['anyOf']):
        found.append(f'{path}: no anyOf branch matched')
    for part in schema.get('allOf',[]): found.extend(schema_errors(value,part,root,path))
    if 'if' in schema and not schema_errors(value,schema['if'],root,path):
        found.extend(schema_errors(value,schema.get('then',{}),root,path))
    if 'const' in schema and value != schema['const']: found.append(f'{path}: must equal {schema["const"]!r}')
    if 'enum' in schema and value not in schema['enum']: found.append(f'{path}: value not in enum')
    expected=schema.get('type')
    type_ok={
        'object':lambda v:isinstance(v,dict), 'array':lambda v:isinstance(v,list),
        'string':lambda v:isinstance(v,str), 'integer':lambda v:isinstance(v,int) and not isinstance(v,bool),
        'number':lambda v:isinstance(v,(int,float)) and not isinstance(v,bool), 'boolean':lambda v:isinstance(v,bool)
    }
    if expected and not type_ok[expected](value):
        return found+[f'{path}: expected {expected}']
    if isinstance(value,dict):
        for key in schema.get('required',[]):
            if key not in value: found.append(f'{path}: missing {key}')
        properties=schema.get('properties',{})
        for key,child in value.items():
            if key in properties: found.extend(schema_errors(child,properties[key],root,f'{path}.{key}'))
            elif schema.get('additionalProperties') is False: found.append(f'{path}: unexpected {key}')
            elif isinstance(schema.get('additionalProperties'),dict): found.extend(schema_errors(child,schema['additionalProperties'],root,f'{path}.{key}'))
        if len(value) < schema.get('minProperties',0): found.append(f'{path}: too few properties')
    if isinstance(value,list):
        if len(value) < schema.get('minItems',0): found.append(f'{path}: too few items')
        if 'maxItems' in schema and len(value) > schema['maxItems']: found.append(f'{path}: too many items')
        if isinstance(schema.get('items'),dict):
            for index,item in enumerate(value): found.extend(schema_errors(item,schema['items'],root,f'{path}[{index}]'))
    if isinstance(value,str):
        if len(value) < schema.get('minLength',0): found.append(f'{path}: string too short')
        if 'pattern' in schema and not re.search(schema['pattern'],value): found.append(f'{path}: pattern mismatch')
    if isinstance(value,(int,float)) and not isinstance(value,bool):
        if 'minimum' in schema and value < schema['minimum']: found.append(f'{path}: below minimum')
        if 'maximum' in schema and value > schema['maximum']: found.append(f'{path}: above maximum')
    return found

documents={'manifest':manifest,'tokens':tokens,'components':components,'acceptance':acceptance}
for name,document in documents.items():
    errors.extend(f'{name}.json schema: {error}' for error in schema_errors(document,schemas[name]))
negative_cases=[]
bad=copy.deepcopy(manifest); bad.pop('version',None); negative_cases.append(('manifest missing version',bad,schemas['manifest']))
bad=copy.deepcopy(tokens); bad['tokens']['color']['paper']['css']='paper'; negative_cases.append(('token invalid css name',bad,schemas['tokens']))
bad=copy.deepcopy(components); bad['components'][0]['acceptance'].append('T8'); negative_cases.append(('component invalid acceptance ID',bad,schemas['components']))
bad=copy.deepcopy(acceptance); bad['tests'].pop(); negative_cases.append(('acceptance missing test',bad,schemas['acceptance']))
for name,document,schema in negative_cases:
    if not schema_errors(document,schema): errors.append(f'negative schema self-test passed unexpectedly: {name}')
versions={x.get('version') for x in (manifest,tokens,components,acceptance) if x}
if len(versions)!=1: errors.append(f'version mismatch: {sorted(versions)}')

def flatten(node,prefix=()):
    out={}
    for key,value in node.items():
        path=prefix+(key,)
        if isinstance(value,dict) and '$value' in value: out['.'.join(path)]=value
        elif isinstance(value,dict): out.update(flatten(value,path))
    return out
primitive=flatten(tokens.get('tokens',{}))
semantic=set(tokens.get('registers',{}).get('day',{})) & set(tokens.get('registers',{}).get('flight-deck',{}))
ids=[]
for component in components.get('components',[]):
    cid=component.get('id'); ids.append(cid)
    if not re.fullmatch(r'(core|domain|interaction)\.[a-z0-9-]+',cid or ''): errors.append(f'invalid component ID {cid}')
    for dep in component.get('required_tokens',[]):
        if dep not in primitive and dep not in semantic: errors.append(f'{cid}: unknown token {dep}')
    if set(component.get('acceptance',[])) != {f'T{i}' for i in range(1,8)}: errors.append(f'{cid}: incomplete acceptance set')
    for ref in [component.get('reference'),component.get('implementation',{}).get('web')]:
        if ref and not (ROOT/ref.split('#')[0].split('?')[0]).is_file(): errors.append(f'{cid}: missing reference {ref}')
if len(ids)!=len(set(ids)): errors.append('duplicate component IDs')
if {t.get('id') for t in acceptance.get('tests',[])} != {f'T{i}' for i in range(1,8)}: errors.append('acceptance tests must be T1 through T7')
for test in acceptance.get('tests',[]):
    tool=test.get('tool')
    if tool and not (ROOT/tool).is_file(): errors.append(f'{test.get("id")}: missing tool {tool}')

for group in ['authority','generated_assets','implementation_assets','audits']:
    for label,ref in manifest.get(group,{}).items():
        if not (ROOT/ref.split('#')[0].split('?')[0]).is_file(): errors.append(f'manifest {group}.{label}: missing {ref}')
for label,refs in manifest.get('files',{}).items():
    for ref in refs:
        if not (ROOT/ref.split('#')[0].split('?')[0]).is_file(): errors.append(f'manifest files.{label}: missing {ref}')
for register,spec in manifest.get('registers',{}).items():
    if not (ROOT/spec.get('study','')).is_file(): errors.append(f'manifest register {register}: missing study')
for face in tokens.get('font_faces',[]):
    if not (ROOT/face.get('src','')).is_file(): errors.append(f'missing font face {face.get("src")}')

css=(ROOT/'components.css').read_text()
if re.search(r'#[0-9a-fA-F]{3,8}\b',css): errors.append('components.css contains raw hex')
if re.search(r'(?<![-\w])\d+(?:\.\d+)?px\b',css): errors.append('components.css contains raw px')
token_css=(ROOT/'tokens.css').read_text()
declared_vars=set(re.findall(r'(--[a-z0-9-]+)\s*:',token_css))
used_vars=set(re.findall(r'var\((--[a-z0-9-]+)',css))
for var in sorted(used_vars-declared_vars): errors.append(f'components.css uses undeclared token {var}')
for component in components.get('components',[]):
    selector=component.get('implementation',{}).get('source_selector')
    if selector and selector not in css: errors.append(f'{component.get("id")}: source selector not found in components.css')
ratified_state_selectors={
    'core.button': {'default':'.amd-button {','hover':'.amd-button[data-variant="primary"]:hover','pressed':'.amd-button[data-variant="primary"]:active','focus-visible':'.amd-button:focus-visible','disabled':'.amd-button:disabled','loading':'.amd-button[aria-busy="true"]'},
    'core.input': {'default':'.amd-input {','focus-visible':'.amd-input:focus-visible','disabled':'.amd-input:disabled','invalid':'.amd-input[aria-invalid="true"]'},
    'core.card': {'tier1':'.amd-card[data-tier="1"]','tier2':'.amd-card[data-tier="2"]','flat':'.amd-card[data-tier="flat"]'},
    'core.tabs': {'default':'.amd-tabs [role="tab"] {','hover':'.amd-tabs [role="tab"]:hover','selected':'.amd-tabs [role="tab"][aria-selected="true"]','focus-visible':'.amd-tabs [role="tab"]:focus-visible'},
    'domain.one-thing': {'day':':root {','flight-deck':'[data-register="flight-deck"]'}
}
for component in components.get('components',[]):
    if component.get('status') != 'ratified': continue
    cid=component.get('id'); contract=ratified_state_selectors.get(cid,{})
    if set(component.get('states',[])) != set(contract): errors.append(f'{cid}: ratified state contract is incomplete')
    for state,selector in contract.items():
        source=token_css if cid == 'domain.one-thing' else css
        if selector not in source: errors.append(f'{cid}: state {state} selector not implemented')

page=(ROOT/'index.html').read_text()
for marker in ['tokens.css','manifest.json','AGENTS.md','components.json','acceptance.json','prototype-starter.html']:
    if marker not in page: errors.append(f'index.html does not expose {marker}')
if '--paper:' in page: errors.append('index.html still contains an inline token source')
if len(re.findall(r'<link\b[^>]*\bhref="tokens\.css"',page,re.I)) != 1: errors.append('index.html must import tokens.css exactly once')
for attr,ref in re.findall(r'\b(href|src)="([^"]+)"',page):
    if ref.startswith(('http:','https:','#','mailto:','data:')): continue
    local=ref.split('#')[0].split('?')[0]
    if local and not (ROOT/local).is_file(): errors.append(f'index.html broken {attr}: {ref}')

starter=(ROOT/'prototype-starter.html').read_text()
for marker in ['tokens.css','components.css','data-register="day"','data-register-choice="flight-deck"']:
    if marker not in starter: errors.append(f'prototype starter missing {marker}')
for field in ['apob','apob-unit']:
    match=re.search(rf'data-field="{field}"[^>]*>([^<]*)<',starter)
    if not match or match.group(1).strip(): errors.append(f'prototype starter hardcodes data-bearing field {field}')
if 'fixture.apob.value' not in starter or 'fixture.apob.unit' not in starter: errors.append('prototype starter does not bind the complete ApoB fixture')

proc=subprocess.run([sys.executable,str(ROOT/'build-agent-kit.py'),'--check'],capture_output=True,text=True)
if proc.returncode: errors.append(proc.stderr.strip() or proc.stdout.strip())
swift_gen=ROOT/'build-swiftui-tokens.py'
if swift_gen.is_file():
    proc=subprocess.run([sys.executable,str(swift_gen),'--check'],capture_output=True,text=True)
    if proc.returncode: errors.append(proc.stderr.strip() or proc.stdout.strip())
for js in ['air-audit.js','copy-audit.js']:
    proc=subprocess.run(['node','--check',str(ROOT/js)],capture_output=True,text=True)
    if proc.returncode: errors.append(f'{js}: {proc.stderr.strip()}')
for py in ['build-agent-kit.py','build-swiftui-tokens.py','validate-agent-kit.py']:
    if not (ROOT/py).is_file(): continue
    proc=subprocess.run([sys.executable,'-m','py_compile',str(ROOT/py)],capture_output=True,text=True)
    if proc.returncode: errors.append(f'{py}: {proc.stderr.strip()}')
if errors:
    print('FAIL')
    for error in errors: print(f'- {error}')
    raise SystemExit(1)
print(f'PASS: v{manifest.get("version")} | {len(ids)} components | 7 acceptance tests | generated tokens current')
