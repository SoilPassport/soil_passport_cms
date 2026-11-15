export interface SubItem { label: string; path: string; perm?: string }
export interface NavItem { key: string; label: string; path: string; perm?: string; phase: 1 | 2 | 3 | 4 | 5 | 6; blurb: string; built?: boolean; children?: SubItem[]; }
export interface NavGroup { label: string; items: NavItem[]; }

export const NAV: NavGroup[] = [
  { label: 'Overview', items: [
    { key: 'dashboard', label: 'Dashboard', path: '/', perm: 'dashboard.view', phase: 1, built: true, blurb: '' } ] },
  { label: 'Content', items: [
    { key: 'pages', label: 'Website Pages', path: '/pages', perm: 'pages.view', phase: 2, built: true, blurb: '',
      children: [{ label: 'All Pages', path: '/pages' }, { label: 'New Page', path: '/pages/new', perm: 'pages.edit' }] },
    { key: 'articles', label: 'News & Articles', path: '/articles', perm: 'articles.view', phase: 2, built: true, blurb: '',
      children: [{ label: 'All Articles', path: '/articles' }, { label: 'New Article', path: '/articles/new', perm: 'articles.edit' }, { label: 'Categories', path: '/articles/categories', perm: 'articles.edit' }] },
    { key: 'events', label: 'Events & Webinars', path: '/events', perm: 'events.view', phase: 4, built: true, blurb: '',
      children: [{ label: 'All Events', path: '/events' }, { label: 'New Event', path: '/events/new', perm: 'events.edit' }] },
    { key: 'vouchers', label: 'Vouchers & Coupons', path: '/vouchers', perm: 'events.view', phase: 4, built: true, blurb: 'Codes for event registration.' },
    { key: 'roadmap', label: 'Roadmap Management', path: '/roadmap', perm: 'roadmap.view', phase: 4, built: true, blurb: 'Milestones with status and public/private visibility. Only approved items are published.' },
    { key: 'seo', label: 'SEO Management', path: '/seo', perm: 'seo.view', phase: 2, built: true, blurb: 'Sitemap and robots.txt generation. Per-page and per-article SEO fields are already in each editor.' } ] },
  { label: 'Media', items: [
    { key: 'media', label: 'Media Library', path: '/media', perm: 'media.view', phase: 3, built: true, blurb: 'Central library on Cloudflare R2 with duplicate detection and usage tracking. Until then, paste image URLs in the editors.' },
    { key: 'gallery', label: 'Gallery', path: '/gallery', perm: 'gallery.view', phase: 3, built: true, children: [{ label: 'All Albums', path: '/gallery' }, { label: 'New Album', path: '/gallery/new', perm: 'gallery.edit' }], blurb: 'Albums built from the media library.' },
    { key: 'video', label: 'Video Library', path: '/video', perm: 'media.view', phase: 3, built: true, blurb: 'MP4/WebM uploads and embeds.' },
    { key: 'documents', label: 'Document Management', path: '/documents', perm: 'documents.view', phase: 3, built: true, children: [{ label: 'All Documents', path: '/documents' }, { label: 'New Document', path: '/documents/new', perm: 'documents.edit' }], blurb: 'Versioned documents with public, restricted, internal and investor-only access.' } ] },
  { label: 'Enquiries', items: [
    { key: 'investment', label: 'Investment Enquiries', path: '/investment', perm: 'investment.view', phase: 4, built: true, blurb: 'Investor enquiries, lead categories, follow-up and notes.' },
    { key: 'partnerships', label: 'Partnership Enquiries', path: '/partnerships', perm: 'partnerships.view', phase: 4, built: true, blurb: 'Partnership applications by category.' },
    { key: 'contact', label: 'Contact Enquiries', path: '/contact', perm: 'contact.view', phase: 4, built: true, blurb: 'Contact and demo requests with assignment and tracking.' },
    { key: 'press', label: 'Media & Press', path: '/press', perm: 'articles.view', phase: 2, blurb: 'Press releases. For now publish press releases as articles in a "Press" category.' },
    { key: 'newsletter', label: 'Newsletter Management', path: '/newsletter', perm: 'newsletter.view', phase: 4, built: true, blurb: 'Subscribers with recorded consent.',
      children: [{ label: 'Subscribers', path: '/newsletter' }, { label: 'Campaigns', path: '/newsletter/campaigns' }] } ] },
  { label: 'Integrations', items: [
    { key: 'crm', label: 'CRM Integration', path: '/crm', perm: 'crm.view', phase: 5, built: true, blurb: 'HubSpot sync status, retries and failed jobs.' },
    { key: 'email', label: 'Email Configuration', path: '/email', perm: 'email.view', phase: 5, built: true, blurb: 'Provider, templates, recipients and test email.' } ] },
  { label: 'Administration', items: [
    { key: 'users', label: 'User Management', path: '/users', perm: 'users.view', phase: 1, built: true, blurb: '' },
    { key: 'roles', label: 'Roles & Permissions', path: '/roles', perm: 'users.view', phase: 1, built: true, blurb: '' },
    { key: 'settings', label: 'Website Settings', path: '/settings', perm: 'settings.view', phase: 2, built: true, blurb: '',
      children: [{ label: 'Announcement Banner', path: '/settings' }] },
    { key: 'config', label: 'Integration Settings', path: '/config', perm: 'config.manage', phase: 6, built: true, blurb: 'Email, HubSpot, Eventbrite, storage and security settings (Super Admin only).' },
    { key: 'storage', label: 'Storage Settings', path: '/storage', perm: 'storage.manage', phase: 3, built: true, blurb: 'Cloudflare R2 connection status and upload limits.' },
    { key: 'audit', label: 'Security & Audit Logs', path: '/audit', perm: 'audit.view', phase: 1, built: true, blurb: '' },
    { key: 'reports', label: 'Reports & Analytics', path: '/reports', perm: 'reports.view', phase: 6, built: true, blurb: 'Content, enquiry and event reporting.' },
    { key: 'system', label: 'System Configuration', path: '/system', perm: 'settings.manage', phase: 6, built: true, blurb: 'Environment, MFA policy, session and upload policy.' } ] },
];
export const ALL_ITEMS = NAV.flatMap(g => g.items);
