import { getSetting } from '../src/db/index.js';

const token = getSetting('admin_access_token', '').trim();
if (!token) {
  console.error('Admin access token belum dikonfigurasi.');
  process.exit(1);
}

console.log(token);
