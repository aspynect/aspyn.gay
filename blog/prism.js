const Prism = require('prismjs');
const loadLanguages = require('prismjs/components/');
loadLanguages(['py']);

// The code snippet you want to highlight, as a string
const code = `

`;

// Returns a highlighted HTML string
const html = Prism.highlight(code, Prism.languages.py, 'py');
console.log(html)