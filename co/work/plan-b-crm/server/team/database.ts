import { Pool, type PoolClient } from 'pg';
export interface Sql { query<T=Record<string,unknown>>(sql:string,values?:unknown[]):Promise<{rows:T[]}>; }
export interface TeamDatabase extends Sql { transaction<T>(run:(sql:Sql)=>Promise<T>):Promise<T>;exec(sql:string):Promise<void>;close():Promise<void>; }
function connection(client:Pool|PoolClient):Sql {return {async query<T>(sql:string,values?:unknown[]){const result=await client.query(sql,values);return {rows:result.rows as T[]};}};}
export function postgresDatabase(url:string):TeamDatabase {
  const pool=new Pool({connectionString:url,max:5,idleTimeoutMillis:30000,connectionTimeoutMillis:10000,application_name:'planb-team'});
  pool.on('error',()=>console.error('Plan B · Se interrumpió una conexión de PostgreSQL. El siguiente trabajo volverá a solicitar conexión.'));
  return {...connection(pool),async transaction<T>(run:(sql:Sql)=>Promise<T>){const client=await pool.connect();try{await client.query('BEGIN');const value=await run(connection(client));await client.query('COMMIT');return value;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}},async exec(sql){await pool.query(sql);},async close(){await pool.end();}};
}
export async function embeddedDatabase(path?:string):Promise<TeamDatabase> {
  const { PGlite }=await import('@electric-sql/pglite');const db=await PGlite.create(path);
  return {async query<T>(sql:string,values?:unknown[]){return {rows:(await db.query(sql,values)).rows as T[]};},async transaction<T>(run:(sql:Sql)=>Promise<T>){return db.transaction(async tx=>run({async query<R>(sql:string,values?:unknown[]){return {rows:(await tx.query(sql,values)).rows as R[]};}}));},async exec(sql){await db.exec(sql);},async close(){await db.close();}};
}
