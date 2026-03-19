// Pin shared deps so esm.sh deduplicates @codemirror/state & /view into one instance.
const _cm = '@codemirror/state@6.5.2,@codemirror/view@6.36.5';
const [
  { basicSetup },
  { EditorState },
  { html },
  { markdown },
  { oneDark },
  { EditorView, keymap, placeholder },
] = await Promise.all([
  import(`https://esm.sh/@codemirror/basic-setup@0.20.0?deps=${_cm}`),
  import(`https://esm.sh/@codemirror/state@6.5.2`),
  import(`https://esm.sh/@codemirror/lang-html@6.4.9?deps=${_cm}`),
  import(`https://esm.sh/@codemirror/lang-markdown@6.3.2?deps=${_cm}`),
  import(`https://esm.sh/@codemirror/theme-one-dark@6.1.2?deps=${_cm}`),
  import(`https://esm.sh/@codemirror/view@6.36.5?deps=@codemirror/state@6.5.2`),
]);

// --- Placeholder content ---
const placeholders = {
  html: `<h1>Hello, World!</h1>\n<p>Paste your HTML here and click <strong>Render & Share</strong>.</p>`,
  markdown: `# Hello, World!\n\nPaste your **Markdown** here and click **Render & Share**.`,
};

// --- State ---
let currentFormat = window.__defaultFormat || 'html';
let editor;
let submitting = false;

// --- DOM ---
const editorEl = document.getElementById('editor');
const btnHtml = document.getElementById('btn-html');
const btnMarkdown = document.getElementById('btn-markdown');
const renderBtn = document.getElementById('render-btn');
const modal = document.getElementById('success-modal');
const shareUrlInput = document.getElementById('share-url');
const copyUrlBtn = document.getElementById('copy-url-btn');
const openPreviewBtn = document.getElementById('open-preview-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const toast = document.getElementById('toast');

// --- Auto-detect format ---
function detectFormat(content) {
  const trimmed = content.trimStart().toLowerCase();
  if (
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<div') ||
    trimmed.startsWith('<head') ||
    trimmed.startsWith('<body') ||
    trimmed.startsWith('<table') ||
    trimmed.startsWith('<p>') ||
    trimmed.startsWith('<h1') ||
    trimmed.startsWith('<section') ||
    trimmed.startsWith('<style') ||
    trimmed.startsWith('<link')
  ) {
    return 'html';
  }
  return null; // no strong signal
}

// --- Editor Setup ---
function getLanguage() {
  return currentFormat === 'html' ? html() : markdown();
}

function createEditor() {
  const submitKeymap = keymap.of([
    {
      key: 'Mod-Enter',
      run: () => {
        handleSubmit();
        return true;
      },
    },
  ]);

  const state = EditorState.create({
    doc: '',
    extensions: [
      basicSetup,
      getLanguage(),
      oneDark,
      submitKeymap,
      placeholder(placeholders[currentFormat]),
      EditorView.theme({
        '&': { backgroundColor: '#1A1A2E' },
        '.cm-gutters': { backgroundColor: '#1A1A2E', borderRight: '1px solid #2A2A40' },
        '.cm-placeholder': { color: '#606080', fontStyle: 'italic' },
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !window.__defaultFormat) {
          const content = update.state.doc.toString();
          if (content.length > 5 && content.length < 50) {
            const detected = detectFormat(content);
            if (detected && detected !== currentFormat) {
              setFormat(detected);
            }
          }
        }
      }),
    ],
  });

  editor = new EditorView({
    state,
    parent: editorEl,
  });
}

function setFormat(format, recreate = true) {
  currentFormat = format;

  btnHtml.classList.toggle('active', format === 'html');
  btnMarkdown.classList.toggle('active', format === 'markdown');

  if (recreate && editor) {
    const content = editor.state.doc.toString();
    editor.destroy();
    const submitKeymap = keymap.of([
      {
        key: 'Mod-Enter',
        run: () => {
          handleSubmit();
          return true;
        },
      },
    ]);

    const state = EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        getLanguage(),
        oneDark,
        submitKeymap,
        placeholder(placeholders[currentFormat]),
        EditorView.theme({
          '&': { backgroundColor: '#1A1A2E' },
          '.cm-gutters': { backgroundColor: '#1A1A2E', borderRight: '1px solid #2A2A40' },
          '.cm-placeholder': { color: '#606080', fontStyle: 'italic' },
        }),
      ],
    });

    editor = new EditorView({ state, parent: editorEl });
  }
}

// --- Submit ---
async function handleSubmit() {
  if (submitting || !editor) return;

  const content = editor.state.doc.toString().trim();
  if (!content) {
    showToast('Please enter some content first');
    return;
  }

  submitting = true;
  renderBtn.disabled = true;
  renderBtn.innerHTML = '<span class="spinner"></span> Rendering...';

  try {
    const res = await fetch('/api/paste', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, format: currentFormat }),
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Something went wrong');
      return;
    }

    const fullUrl = window.location.origin + data.url;
    shareUrlInput.value = fullUrl;
    openPreviewBtn.href = data.url;
    modal.classList.add('visible');
  } catch (err) {
    showToast('Network error. Please try again.');
  } finally {
    submitting = false;
    renderBtn.disabled = false;
    renderBtn.innerHTML = 'Render & Share';
  }
}

// --- Toast ---
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 3000);
}

// --- Event Listeners ---
btnHtml.addEventListener('click', () => setFormat('html'));
btnMarkdown.addEventListener('click', () => setFormat('markdown'));
renderBtn.addEventListener('click', handleSubmit);

copyUrlBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(shareUrlInput.value).then(() => {
    copyUrlBtn.textContent = 'Copied!';
    setTimeout(() => (copyUrlBtn.textContent = 'Copy'), 2000);
  });
});

closeModalBtn.addEventListener('click', () => {
  modal.classList.remove('visible');
  editor.dispatch({
    changes: { from: 0, to: editor.state.doc.length, insert: '' },
  });
  editor.focus();
});

modal.addEventListener('click', (e) => {
  if (e.target === modal) {
    modal.classList.remove('visible');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal.classList.contains('visible')) {
    modal.classList.remove('visible');
  }
});

// --- Init ---
try {
  createEditor();
} catch (err) {
  console.error('CodeMirror failed to initialise:', err);
  editorEl.textContent = 'Editor failed to load — please refresh the page.';
}
