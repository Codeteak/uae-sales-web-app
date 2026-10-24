export function contactImportError(row:{name:string;email:string;companyId:string}) {
  if(!row.name.trim()) return 'Missing name';
  if(!row.companyId) return 'Company not found';
  if(row.email && !/^\S+@\S+\.\S+$/.test(row.email)) return 'Invalid email';
  return '';
}