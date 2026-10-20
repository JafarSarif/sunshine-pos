/**
 * Sunshine Categories & Theme Metadata
 * Defines dedicated colors, icons, badge styles and glow accents for each inventory category
 */

const SUNSHINE_CATEGORIES = {
  'Accessories': {
    name: 'Accessories',
    icon: '⚡',
    color: '#06b6d4',      // Vibrant Cyan
    bg: 'rgba(6, 182, 212, 0.16)',
    border: 'rgba(6, 182, 212, 0.4)',
    glow: 'rgba(6, 182, 212, 0.3)'
  },
  'Books': {
    name: 'Books',
    icon: '📚',
    color: '#f59e0b',      // Amber Gold
    bg: 'rgba(245, 158, 11, 0.16)',
    border: 'rgba(245, 158, 11, 0.4)',
    glow: 'rgba(245, 158, 11, 0.3)'
  },
  'Pens': {
    name: 'Pens',
    icon: '✒️',
    color: '#a855f7',      // Vivid Purple
    bg: 'rgba(168, 85, 247, 0.16)',
    border: 'rgba(168, 85, 247, 0.4)',
    glow: 'rgba(168, 85, 247, 0.3)'
  },
  'Gadgets': {
    name: 'Gadgets',
    icon: '🎮',
    color: '#10b981',      // Emerald Green
    bg: 'rgba(16, 185, 129, 0.16)',
    border: 'rgba(16, 185, 129, 0.4)',
    glow: 'rgba(16, 185, 129, 0.3)'
  },
  'Smartwatches': {
    name: 'Smartwatches',
    icon: '⌚',
    color: '#f43f5e',      // Rose Pink
    bg: 'rgba(244, 63, 94, 0.16)',
    border: 'rgba(244, 63, 94, 0.4)',
    glow: 'rgba(244, 63, 94, 0.3)'
  },
  'Phones': {
    name: 'Phones',
    icon: '📱',
    color: '#3b82f6',      // Royal Blue
    bg: 'rgba(59, 130, 246, 0.16)',
    border: 'rgba(59, 130, 246, 0.4)',
    glow: 'rgba(59, 130, 246, 0.3)'
  },
  'Earphones': {
    name: 'Earphones',
    icon: '🎧',
    color: '#14b8a6',      // Teal
    bg: 'rgba(20, 184, 166, 0.16)',
    border: 'rgba(20, 184, 166, 0.4)',
    glow: 'rgba(20, 184, 166, 0.3)'
  },
  'Earpods': {
    name: 'Earpods',
    icon: '🍏',
    color: '#84cc16',      // Lime Green
    bg: 'rgba(132, 204, 22, 0.16)',
    border: 'rgba(132, 204, 22, 0.4)',
    glow: 'rgba(132, 204, 22, 0.3)'
  },
  'Earbuds': {
    name: 'Earbuds',
    icon: '🫧',
    color: '#fb923c',      // Vibrant Coral
    bg: 'rgba(251, 146, 60, 0.16)',
    border: 'rgba(251, 146, 60, 0.4)',
    glow: 'rgba(251, 146, 60, 0.3)'
  },
  'Neckbands': {
    name: 'Neckbands',
    icon: '🧲',
    color: '#ec4899',      // Hot Pink
    bg: 'rgba(236, 72, 153, 0.16)',
    border: 'rgba(236, 72, 153, 0.4)',
    glow: 'rgba(236, 72, 153, 0.3)'
  }
};

const SunshineCategoriesObj = {
  list: Object.keys(SUNSHINE_CATEGORIES),
  meta: SUNSHINE_CATEGORIES,

  getAll() {
    return Object.keys(SUNSHINE_CATEGORIES);
  },
  
  get(categoryName) {
    if (!categoryName) return {
      name: 'General',
      icon: '📦',
      color: '#6366f1',
      bg: 'rgba(99, 102, 241, 0.16)',
      border: 'rgba(99, 102, 241, 0.4)',
      glow: 'rgba(99, 102, 241, 0.3)'
    };
    return SUNSHINE_CATEGORIES[categoryName] || {
      name: categoryName,
      icon: '📦',
      color: '#6366f1',
      bg: 'rgba(99, 102, 241, 0.16)',
      border: 'rgba(99, 102, 241, 0.4)',
      glow: 'rgba(99, 102, 241, 0.3)'
    };
  },

  getBadgeHtml(categoryName, customClass = '') {
    const item = this.get(categoryName);
    return `<span class="badge-cat ${customClass}" style="--cat-color: ${item.color}; --cat-bg: ${item.bg}; --cat-border: ${item.border}; --cat-glow: ${item.glow}; color: ${item.color}; background: ${item.bg}; border: 1px solid ${item.border}; box-shadow: 0 0 10px ${item.glow};"><span class="badge-cat-icon">${item.icon}</span> ${item.name}</span>`;
  }
};

if (typeof window !== 'undefined') {
  window.SunshineCategories = SunshineCategoriesObj;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SunshineCategoriesObj;
}
