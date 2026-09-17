import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { applyBrandColor, readCachedBrandColor } from './lib/brandTheme';
import { currentTenantSlug } from './lib/tenantSlug';

const slug = currentTenantSlug();
if (slug) {
  applyBrandColor(readCachedBrandColor(slug));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
