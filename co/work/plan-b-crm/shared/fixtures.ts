import type { AppSpec, CrmRecord, CrmSnapshot, Entity, Field, Rule } from './model.js';
export const fixtureProfiles = [
  { id: 'agency', name: 'Agencia Norte', description: 'Servicios, clientes y seguimiento comercial' },
  { id: 'distribution', name: 'Distribuidora Atlas', description: 'Pedidos, referencias y fechas de entrega' }
];
const field = (key: string, label: string, type: Field['type'] = 'text', required = false, rest: Partial<Field> = {}): Field =>
  ({ key, label, type, required, readOnly: false, options: [], referenceEntity: null, ...rest });
const imported = (id: string, entity: Rule['entity'], kind: Rule['kind'], key: string, description: string, rest: Partial<Rule> = {}): Rule =>
  ({ id, entity, kind, field: key, value: null, whenField: null, whenValue: null, origin: 'configuration', description, evidence: 'Configuración de ensayo: ' + description, ...rest });
export function makeFixture(profile: 'agency' | 'distribution' = 'agency'): CrmSnapshot {
  const distribution = profile === 'distribution';
  const stages = distribution ? [
    { id: 'received', label: 'Recibida', color: '#6685cc' }, { id: 'validated', label: 'Validada', color: '#a079d2' },
    { id: 'delivery', label: 'En entrega', color: '#dc9f43' }, { id: 'won', label: 'Completada', color: '#3b9b75' }
  ] : [
    { id: 'contact', label: 'Contacto', color: '#6685cc' }, { id: 'proposal', label: 'Propuesta', color: '#a079d2' },
    { id: 'negotiation', label: 'Negociación', color: '#dc9f43' }, { id: 'won', label: 'Ganada', color: '#3b9b75' }
  ];
  const entities: Entity[] = [
    { id: 'contacts', label: 'Clientes', singular: 'cliente', displayField: 'firstname',
      columns: ['firstname', 'company_id', 'email', 'phone'], fields: [
        field('firstname', 'Nombre', 'text', true), field('lastname', 'Apellidos'),
        field('email', 'Correo', 'email', true), field('phone', 'Teléfono'),
        field('company_id', 'Empresa', 'reference', false, { referenceEntity: 'companies' }),
        distribution ? field('customer_code', 'Código de cliente', 'text', true)
          : field('service', 'Servicio contratado', 'enum', false, { options: [
            { id: 'web', label: 'Diseño web' }, { id: 'brand', label: 'Identidad de marca' }, { id: 'marketing', label: 'Marketing' }
          ] })
      ] },
    { id: 'companies', label: 'Empresas', singular: 'empresa', displayField: 'name',
      columns: ['name', 'domain', 'phone'], fields: [field('name', 'Nombre', 'text', true), field('domain', 'Sitio web'), field('phone', 'Teléfono')] },
    { id: 'deals', label: 'Oportunidades', singular: 'oportunidad', displayField: 'dealname',
      columns: ['dealname', 'company_id', 'amount', 'dealstage'], fields: [
        field('dealname', 'Nombre de la oportunidad', 'text', true),
        field('amount', 'Importe (€)', 'number', true),
        field('dealstage', 'Etapa', 'enum', true, { options: stages.map(s => ({ id: s.id, label: s.label })) }),
        field('company_id', 'Empresa', 'reference', false, { referenceEntity: 'companies' }),
        field('contact_id', 'Cliente', 'reference', false, { referenceEntity: 'contacts' }),
        distribution ? field('reference', 'Referencia del pedido') : field('service', 'Servicio', 'enum', false, { options: [
          { id: 'web', label: 'Diseño web' }, { id: 'brand', label: 'Identidad de marca' }, { id: 'marketing', label: 'Marketing' }
        ] }),
        distribution ? field('delivery_date', 'Fecha de entrega', 'date') : field('closedate', 'Fecha prevista de cierre', 'date')
      ] },
    { id: 'tasks', label: 'Tareas', singular: 'tarea', displayField: 'subject',
      columns: ['subject', 'due_date', 'status', 'contact_id'], fields: [
        field('subject', 'Asunto', 'text', true), field('due_date', 'Fecha límite', 'date', true),
        field('status', 'Estado', 'enum', true, { options: [{ id: 'pending', label: 'Pendiente' }, { id: 'completed', label: 'Completada' }] }),
        field('contact_id', 'Cliente', 'reference', false, { referenceEntity: 'contacts' }),
        field('deal_id', 'Oportunidad', 'reference', false, { referenceEntity: 'deals' }),
        field('notes', 'Notas')
      ] }
  ];
  const companyNames = ['Estudio Arce', 'Norte Digital', 'Taller Sur', 'Atlas Servicios', 'Forma & Fondo', 'Luma Estudio', 'Casa Olmo', 'Brisa Consultoría'];
  const names = [['Lucía', 'Martín'], ['Pablo', 'García'], ['Ana', 'Ruiz'], ['Marcos', 'López'], ['Elena', 'Santos'], ['Diego', 'Navarro'], ['Marta', 'Vega'], ['Sergio', 'Romero'],
    ['Clara', 'Molina'], ['Hugo', 'Ortega'], ['Laura', 'Castro'], ['David', 'Gil'], ['Sara', 'Soler'], ['Álvaro', 'Ramos'], ['Paula', 'Torres'], ['Javier', 'Medina'],
    ['Nerea', 'Blanco'], ['Iván', 'Cano'], ['Celia', 'Luna'], ['Adrián', 'Pascual'], ['Vera', 'León'], ['Raúl', 'Ríos'], ['Noa', 'Suárez'], ['Leo', 'Ferrer']];
  const records: CrmRecord[] = [];
  companyNames.forEach((name, i) => records.push({ id: 'company-' + (i + 1), entity: 'companies',
    values: { name, domain: 'https://empresa-' + (i + 1) + '.example.com', phone: '900 000 ' + String(i + 1).padStart(3, '0') } }));
  names.forEach(([firstname, lastname], i) => records.push({
    id: 'contact-' + (i + 1), entity: 'contacts', values: {
      firstname, lastname, email: (firstname + '.' + lastname).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() + '@example.com',
      phone: '600 000 ' + String(i + 1).padStart(3, '0'), company_id: 'company-' + (i % 8 + 1),
      ...(distribution ? { customer_code: 'CLI-' + String(i + 1).padStart(4, '0') } : { service: ['web', 'brand', 'marketing'][i % 3] })
    }
  }));
  for (let i = 0; i < 12; i++) records.push({ id: 'deal-' + (i + 1), entity: 'deals', values: {
    dealname: (distribution ? 'Suministro · ' : ['Rediseño web · ', 'Nueva identidad · ', 'Campaña digital · '][i % 3]) + companyNames[i % 8],
    amount: 1200 + i * 350, dealstage: stages[i % 4].id, company_id: 'company-' + (i % 8 + 1), contact_id: 'contact-' + (i + 1),
    ...(distribution ? { reference: 'PED-' + (2400 + i), delivery_date: '2026-11-' + String(i % 20 + 1).padStart(2, '0') }
      : { service: ['web', 'brand', 'marketing'][i % 3], closedate: '2026-11-' + String(i % 20 + 1).padStart(2, '0') })
  } });
  for (let i = 0; i < 18; i++) records.push({ id: 'task-' + (i + 1), entity: 'tasks', values: {
    subject: ['Preparar propuesta', 'Revisar los detalles', 'Llamar para seguimiento', 'Enviar documentación'][i % 4] + ' · ' + names[i][0],
    due_date: '2026-11-' + String(i % 20 + 1).padStart(2, '0'), status: i % 5 === 0 ? 'completed' : 'pending',
    contact_id: 'contact-' + (i + 1), deal_id: 'deal-' + (i % 12 + 1), notes: 'Registro ficticio para comprobar la continuidad.'
  } });
  const rules: Rule[] = [
    imported('contact-email', 'contacts', 'email', 'email', 'El correo debe tener un formato válido.'),
    imported('deal-positive', 'deals', 'min', 'amount', 'El importe debe ser igual o superior a cero.', { value: '0' }),
    distribution
      ? imported('delivery-reference', 'deals', 'conditional_required', 'reference', 'Indica la referencia antes de pasar a En entrega.', { whenField: 'dealstage', whenValue: 'delivery' })
      : imported('proposal-service', 'deals', 'conditional_required', 'service', 'Selecciona un servicio antes de pasar a Propuesta.', { whenField: 'dealstage', whenValue: 'proposal' })
  ];
  const links = records.flatMap(record => {
    const entity = entities.find(e => e.id === record.entity)!;
    return entity.fields.filter(f => f.type === 'reference' && record.values[f.key]).map(f => ({
      fromEntity: record.entity, fromId: record.id, toEntity: f.referenceEntity!, toId: String(record.values[f.key]), label: f.key
    }));
  });
  return {
    version: 1, id: 'fixture-' + profile, name: distribution ? 'Distribuidora Atlas' : 'Agencia Norte',
    capturedAt: new Date().toISOString(), source: { kind: 'fixture', accountId: 'demo-' + profile, isTestData: true,
      description: 'Captura sintética con formato normalizado. No procede de una cuenta real de HubSpot.' },
    entities, records, links, stages, rules,
    unsupported: ['Campañas y envío de correos', 'Permisos multiusuario', 'Automatizaciones de terceros', 'Devolución automática de cambios al CRM'],
    manifest: { complete: true, expectedCounts: { contacts: 24, companies: 8, deals: 12, tasks: 18 }, expectedLinks: links.length }
  };
}
export function makeDemoSpec(snapshot: CrmSnapshot): AppSpec {
  return {
    version: snapshot.version, title: snapshot.name, description: 'Tu equipo sigue trabajando con su copia local.',
    ...(snapshot.version===2 ? {roles:{stage:'dealstage',amount:'amount',pipeline:snapshot.pipelines?.length?'pipeline':null,dueDate:snapshot.source.kind==='hubspot'?'hs_timestamp':'due_date',taskStatus:snapshot.source.kind==='hubspot'?'hs_task_status':'status'}}:{}),
    entities: structuredClone(snapshot.entities), stages: structuredClone(snapshot.stages),
    rules: structuredClone(snapshot.rules),
    coverage: { supported: ['Consultar y editar clientes', 'Gestionar empresas y sus relaciones', 'Avanzar oportunidades entre etapas', 'Crear y completar tareas', 'Conservar y exportar cambios locales'],
      unsupported: [...snapshot.unsupported] }
  };
}
