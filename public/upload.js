const form = document.getElementById('upload-form'), status = document.getElementById('upload-status');
form.addEventListener('submit', async event => {
  event.preventDefault();
  const file = document.getElementById('manuscript').files[0];
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) { status.textContent = 'Choose a file smaller than 20 MB.'; return; }
  const button = form.querySelector('button'); button.disabled = true; status.textContent = 'Uploading…';
  try {
    const response = await fetch(location.pathname, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) }, body: file });
    const result = await response.json();
    if (!response.ok) {
      const message = result.code === 'transfer_unavailable'
        ? 'This upload link is no longer available. Return to your AI conversation for a new link.'
        : [result.error || 'Upload failed. Please retry.', result.action].filter(Boolean).join(' ');
      throw new Error(message);
    }
    form.hidden = true; form.reset(); status.textContent = 'Uploaded. Return to your AI conversation and say “Uploaded”.';
  } catch (error) { status.textContent = error instanceof TypeError ? 'Could not connect to the service. Try Upload again.' : error.message; }
  finally { button.disabled = false; }
});
