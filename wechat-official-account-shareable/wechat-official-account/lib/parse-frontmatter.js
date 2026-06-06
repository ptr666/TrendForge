const matter = require('gray-matter');

function parseFrontmatter(markdown) {
  const parsed = matter(markdown || '');
  return {
    data: parsed.data || {},
    content: parsed.content || '',
    excerpt: parsed.excerpt || '',
  };
}

module.exports = {
  parseFrontmatter,
};
