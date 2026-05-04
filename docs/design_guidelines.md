# Artist Portal Design Guidelines

## Design Approach

**Selected Approach:** Design System with Creative Platform Influences  
**Primary References:** Linear (dashboard efficiency) + Behance (artist-friendly presentation)  
**Rationale:** This is a utility-focused admin tool requiring clear workflows, but serving creative users who appreciate thoughtful design. Balance professional efficiency with visual warmth.

## Typography

**Font Families:**
- Primary: Inter (via Google Fonts) - Clean, professional, excellent readability
- Accent: Crimson Pro (for artist-facing headlines) - Adds warmth without sacrificing legibility

**Type Scale:**
- Hero/Page Titles: text-4xl md:text-5xl font-bold
- Section Headers: text-2xl md:text-3xl font-semibold
- Card Titles: text-lg font-semibold
- Body Text: text-base leading-relaxed
- Captions/Meta: text-sm
- Micro-labels: text-xs uppercase tracking-wide

## Layout System

**Spacing Primitives:** Tailwind units of 2, 4, 6, 8, 12, 16  
**Container Strategy:**
- Dashboard layouts: max-w-7xl mx-auto px-6
- Forms: max-w-2xl mx-auto
- Full-width artwork galleries: w-full with inner max-w-screen-2xl

**Grid Systems:**
- Admin review queue: 3-column masonry grid (grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6)
- Artist submissions: 2-column cards (grid-cols-1 lg:grid-cols-2 gap-8)
- Dashboard stats: 4-column metrics (grid-cols-2 md:grid-cols-4 gap-4)

## Component Library

### Authentication Pages
**Login/Register:**
- Split-screen layout (hidden on mobile, single column)
- Left: Compelling artwork showcase with subtle overlay
- Right: Centered form (max-w-md) with generous padding (p-8)
- Form inputs: h-12 with rounded-lg borders
- Primary CTA button: w-full h-12 rounded-lg font-semibold

### Navigation
**Logged-in Header:**
- Fixed top navigation (h-16) with backdrop blur
- Left: Logo + current page indicator
- Right: User avatar (w-10 h-10 rounded-full) + notification badge + logout
- Mobile: Hamburger menu expanding to full-screen overlay

**Admin Sidebar (Desktop):**
- Fixed left sidebar (w-64) with vertical navigation
- Navigation items: px-4 py-3 rounded-lg with icon + label
- Active state: Distinct background treatment
- Collapsible to icon-only on medium screens

### Dashboard Components

**Artist Dashboard:**
- Hero section with greeting + quick upload CTA (h-48 mb-12)
- Stats row: Total uploads, Approved, Pending, Rejected (grid-cols-2 md:grid-cols-4)
- Recent submissions: Large cards showing artwork thumbnail (aspect-square), title, status badge, submission date

**Admin Review Queue:**
- Filter bar: Sticky top-24, buttons for All/Pending/Approved/Rejected
- Artwork cards in masonry grid:
  - Image preview (aspect-square object-cover rounded-lg)
  - Artist name + submission date
  - Title + truncated description
  - Action buttons: Approve/Reject (side-by-side, equal width)
  - Quick view modal trigger

### Forms

**Artwork Upload Form:**
- Single-column layout with clear visual hierarchy
- File upload zone: Dashed border, h-64, centered upload icon + instructions
- Image preview after selection: rounded-lg with remove option
- Text inputs: Full-width with floating labels
- Multi-select tags: Pill-style badges that can be added/removed
- Submit button: Prominent, bottom-right aligned

**Input Styling:**
- Text fields: px-4 py-3 rounded-lg border-2 transition
- Textareas: min-h-32 with resize-y
- Focus states: Border emphasis + subtle shadow
- Error states: Border treatment + text-sm error message below

### Cards & Lists

**Artwork Submission Cards:**
- Rounded-lg with subtle elevation
- Image: aspect-video or aspect-square (consistent within view)
- Content padding: p-6
- Status badges: px-3 py-1 rounded-full text-xs font-semibold uppercase
- Metadata row: text-sm with icons (calendar, tag, user)

**Admin Action Cards:**
- Expanded view with larger preview (max-h-96)
- Two-column info section: Left (metadata), Right (admin actions)
- Action buttons: Full-width within their column, stacked with gap-3
- Rejection reason textarea appears when reject clicked

### Modals & Overlays

**Modal Structure:**
- Centered overlay with backdrop blur
- Modal container: max-w-4xl mx-auto with rounded-xl
- Header: px-8 py-6 with title + close button
- Content: px-8 py-6 max-h-[70vh] overflow-y-auto
- Footer: px-8 py-6 with action buttons (Cancel + Primary)

**Toast Notifications:**
- Fixed top-right (top-20 right-6)
- Rounded-lg with icon + message + dismiss
- Auto-dismiss after 5 seconds
- Stack with gap-3 for multiple

### Tables (Admin Views)

**Artist Management Table:**
- Full-width with sticky header
- Columns: Avatar, Name, Email, Status, Uploads, Actions
- Row height: h-16 with px-6 padding
- Hover state on rows
- Action dropdowns: Approve account, Deactivate, View profile

## Animations

**Minimal & Purposeful:**
- Page transitions: Simple fade (duration-200)
- Modal entry: Scale from 95% to 100% + fade
- Card hover: Subtle lift (shadow transition)
- Loading states: Skeleton screens (pulse animation)
- Status changes: Brief highlight flash on update

**Avoid:**
- Scroll-triggered animations
- Excessive hover effects
- Distracting micro-interactions

## Images

**Hero Image (Login/Register):**
- Full-bleed artistic photography or curated artwork showcase
- Subtle gradient overlay for text legibility
- Image: Professional, inspiring creative work
- Placement: Left 50% of split-screen desktop, background on mobile

**Dashboard Decoration:**
- Optional: Small accent image in empty states (h-48 w-auto opacity-20)
- Artist avatars: Circular thumbnails throughout

**Artwork Thumbnails:**
- Consistent aspect ratios within each view
- Always object-cover with rounded corners
- Hover: Slight scale (scale-105) for preview indication

## Responsive Behavior

**Breakpoints:**
- Mobile: Single column, stacked navigation
- Tablet (md:): 2-column grids, sidebar collapses to icons
- Desktop (lg:): Full multi-column layouts, persistent sidebar

**Mobile Priorities:**
- Bottom navigation for primary artist actions
- Simplified card layouts with essential info only
- Upload button: Fixed bottom-right FAB (floating action button)
- Admin: Single column review queue with swipe actions

## Accessibility

**Consistent Implementation:**
- All interactive elements: min-h-11 (44px touch target)
- Form labels: Explicit association with inputs
- Status indicators: Icon + text (not color alone)
- Focus visible: 2px outline offset-2
- Skip links for keyboard navigation
- ARIA labels for icon-only buttons