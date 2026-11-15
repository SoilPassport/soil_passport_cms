export type BlockType = 'hero' | 'text' | 'text_image' | 'cards' | 'stats' | 'faq' | 'cta';
export interface Field { k: string; l: string; area?: boolean; hint?: string }
export interface BlockDef { label: string; fields: Field[]; items?: { key: string; label: string; fields: Field[] } }
export type Block = { type: BlockType; [k: string]: unknown };

export const BLOCKS: Record<BlockType, BlockDef> = {
  hero: { label: 'Hero banner', fields: [{ k: 'heading', l: 'Heading' }, { k: 'text', l: 'Text', area: true }, { k: 'cta_label', l: 'Button label' }, { k: 'cta_url', l: 'Button link', hint: 'https://… or a page such as contact.html' }, { k: 'image_url', l: 'Image URL' }] },
  text: { label: 'Text section', fields: [{ k: 'heading', l: 'Heading' }, { k: 'body', l: 'Text', area: true, hint: 'Plain text. Leave a blank line between paragraphs.' }] },
  text_image: { label: 'Text and image', fields: [{ k: 'heading', l: 'Heading' }, { k: 'body', l: 'Text', area: true }, { k: 'image_url', l: 'Image URL' }, { k: 'image_alt', l: 'Image description (for screen readers)' }] },
  cards: { label: 'Cards', fields: [{ k: 'heading', l: 'Section heading' }], items: { key: 'items', label: 'Card', fields: [{ k: 'title', l: 'Title' }, { k: 'text', l: 'Text', area: true }, { k: 'url', l: 'Link (optional)' }] } },
  stats: { label: 'Statistics', fields: [{ k: 'heading', l: 'Section heading' }], items: { key: 'items', label: 'Statistic', fields: [{ k: 'value', l: 'Value (e.g. 1M)' }, { k: 'label', l: 'Label' }] } },
  faq: { label: 'Questions and answers', fields: [{ k: 'heading', l: 'Section heading' }], items: { key: 'items', label: 'Question', fields: [{ k: 'q', l: 'Question' }, { k: 'a', l: 'Answer', area: true }] } },
  cta: { label: 'Call to action', fields: [{ k: 'heading', l: 'Heading' }, { k: 'text', l: 'Text', area: true }, { k: 'cta_label', l: 'Button label' }, { k: 'cta_url', l: 'Button link' }] },
};
