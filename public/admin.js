const $ = id => document.getElementById(id);
let token = '';
const showError = message => { $('admin-error').textContent = message; $('admin-error').hidden = !message; };
async function api(path, body) {
  const response = await fetch('/api/admin/' + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error((await response.json()).error);
  return response;
}
const date = value => value ? value.slice(0, 19).replace('T', ' ') : '—';
const cell = (row, text) => { const td = document.createElement('td'); td.textContent = text; row.append(td); return td; };
function action(parent, text, fn) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'text-button'; button.textContent = text;
  button.addEventListener('click', async () => { button.disabled = true; showError(''); try { await fn(); } catch (error) { showError(error.message); } finally { button.disabled = false; } }); parent.append(button);
}
function showIssued(invitation) {
  $('issued-value').value = invitation.code || '';
  $('issued-url').value = invitation.url || '';
  $('issued').hidden = !invitation.code;
  $('issued-link').hidden = !invitation.url;
  if (!invitation.code) {
    showError('This older code becomes available here after someone uses its invitation again.');
    return;
  }
  $('issued-label').textContent = `Invitation code for ${invitation.name}`;
  $('copy-issued').textContent = 'Copy code';
  $('issued').scrollIntoView({ block: 'nearest' });
}
async function refresh() {
  const data = await (await api('summary')).json();
  $('dashboard').hidden = false; $('admin-login').hidden = true; $('admin-actions').hidden = false;
  $('users').replaceChildren(); $('keys').replaceChildren(); $('events').replaceChildren();
  $('no-users').hidden = data.users.length > 0; $('no-keys').hidden = data.keys.length > 0; $('no-events').hidden = data.events.length > 0;
  for (const user of data.users) {
    const row = document.createElement('tr'); cell(row, user.name); cell(row, `${user.conversions_today} / ${data.daily_limit}`); cell(row, date(user.last_used)); cell(row, `${user.calls} / ${user.errors}`);
    const controls = cell(row, user.revoked ? 'Revoked' : '');
    if (!user.revoked) {
      action(controls, 'Revoke', async () => { await api('revoke-invitation', { id: user.id }); await refresh(); });
      action(controls, 'Show invitation', async () => { showIssued(await (await api('show-invitation', { id: user.id })).json()); });
    }
    $('users').append(row);
  }
  for (const key of data.keys) {
    const user = data.users.find(user => user.id === key.invitation_id), row = document.createElement('tr');
    cell(row, user?.name || 'Unknown'); cell(row, date(key.created_at));
    const controls = cell(row, key.revoked || user?.revoked ? 'Revoked' : '');
    if (!key.revoked && !user?.revoked) action(controls, 'Revoke', async () => { await api('revoke-key', { id: key.id }); await refresh(); });
    $('keys').append(row);
  }
  for (const event of data.events) {
    const row = document.createElement('tr'); for (const value of [date(event.time), event.who, event.operation, event.outcome]) cell(row, value); $('events').append(row);
  }
}
$('admin-login').addEventListener('submit', async event => {
  event.preventDefault(); token = $('admin-token').value.trim(); showError('');
  try { await refresh(); $('admin-token').value = ''; } catch (error) { token = ''; showError(error.message); }
});
$('logout').addEventListener('click', () => { token = ''; $('dashboard').hidden = true; $('dashboard').querySelectorAll('tbody').forEach(el => el.replaceChildren()); $('admin-login').hidden = false; $('admin-actions').hidden = true; $('issued-value').value = ''; $('issued-url').value = ''; $('issued').hidden = true; $('admin-token').focus(); });
$('create-invitation').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true; showError('');
  try { const result = await (await api('invitations', { name: $('person-name').value })).json(); showIssued(result); $('person-name').value = ''; await refresh(); }
  catch (error) { showError(error.message); } finally { button.disabled = false; }
});
for (const [buttonId, inputId] of [['copy-issued', 'issued-value'], ['copy-issued-url', 'issued-url']]) {
  $(buttonId).addEventListener('click', async () => {
    const button = $(buttonId), label = button.textContent;
    try { await navigator.clipboard.writeText($(inputId).value); button.textContent = 'Copied'; setTimeout(() => { button.textContent = label; }, 1800); }
    catch { $(inputId).focus(); $(inputId).select(); showError('Copy the selected text manually.'); }
  });
}
$('refresh').addEventListener('click', () => refresh().catch(error => showError(error.message)));
$('download-logs').addEventListener('click', async () => {
  try { const blob = await (await api('logs.csv')).blob(); const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'usage.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  catch (error) { showError(error.message); }
});
