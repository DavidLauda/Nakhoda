"""Supabase REST publisher. Only trusted Actions receives its service-role key."""
from __future__ import annotations
import hashlib
import os
import pathlib
import requests

class Publisher:
    def __init__(self):
        url=os.getenv('NEXT_PUBLIC_SUPABASE_URL');key=os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        if not url or not key:raise RuntimeError('missing_supabase_service_configuration')
        self.url=url.rstrip('/');self.session=requests.Session();self.session.headers.update({'apikey':key,'Authorization':f'Bearer {key}'})

    def table(self,name:str,params:dict|None=None):
        response=self.session.get(f'{self.url}/rest/v1/{name}',params=params,timeout=30);response.raise_for_status();return response.json()

    def upsert(self,name:str,rows:list[dict]|dict,conflict:str) -> list[dict]:
        response=self.session.post(f'{self.url}/rest/v1/{name}',params={'on_conflict':conflict},headers={'Prefer':'resolution=merge-duplicates,return=representation','Content-Type':'application/json'},json=rows if isinstance(rows,list) else [rows],timeout=45)
        response.raise_for_status();return response.json()

    def exists(self,result_key:str)->bool:
        return bool(self.table('observations',{'select':'id','result_key':f'eq.{result_key}','limit':1}))

    def pilot_area(self)->str:
        rows=self.table('study_areas',{'select':'id','code':'eq.pilot','limit':1})
        if not rows:raise RuntimeError('pilot study area missing: run SQL migration')
        return rows[0]['id']

    def upload(self,kind:str,path:pathlib.Path,key:str)->dict:
        mime='image/png' if path.suffix=='.png' else 'application/json'
        content=path.read_bytes();digest=hashlib.sha256(content).hexdigest()
        response=self.session.post(f'{self.url}/storage/v1/object/analysis-artifacts/{key}',headers={'Content-Type':mime,'x-upsert':'true'},data=content,timeout=60)
        response.raise_for_status()
        return {'kind':kind,'storage_key':key,'sha256':digest,'manifest_version':'v1'}

def stable_key(*parts)->str:
    return hashlib.sha256('|'.join(map(str,parts)).encode()).hexdigest()
