import { makeFixture } from '../../shared/fixtures.js';
import { TeamRepository } from './repository.js';
import { demoUsers } from './app.js';
export async function seedTeamDemo(repo:TeamRepository){
  if((await repo.db.query('SELECT id FROM team_spaces LIMIT 1')).rows.length)return;
  const owner=demoUsers[0];
  for(const [index,name] of ['Equipo Arce · Ensayo','Equipo Faro · Ensayo'].entries()){
    const space=await repo.createSpace(owner,name),snapshot=makeFixture(index?'distribution':'agency');snapshot.name=name;
    snapshot.records.find(r=>r.entity==='companies')!.values.name=index?'Empresa de prueba Faro':'Empresa de prueba Arce';
    for(const user of demoUsers.slice(1))await repo.db.query('INSERT INTO team_members VALUES($1,$2,$3,$4)',[space.id,user.uid,user.email,user.uid==='demo-manager'?'manager':user.uid==='demo-sales'?'sales':'viewer']);
    await repo.importSnapshot(space.id,owner,snapshot);
  }
}
