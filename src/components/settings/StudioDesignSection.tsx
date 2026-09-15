import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { BRAND_PRESETS, deriveBrandTokens, isBrandColorAllowed, normalizeHex } from '../../design/brand';
import { brandTokensToCssVars } from '../../lib/brandTheme';
import {
  getStudioLogoUrl,
  saveStudioBranding,
  STUDIO_NAME_MAX,
  STUDIO_NAME_MIN,
  TAGLINE_MAX,
  validateLogoFile,
} from '../../lib/studioBranding';
import { useTenant } from '../../context/TenantContext';
import type { Tenant } from '../../types';
import FeedbackDialog, { FeedbackDialogState } from '../ui/FeedbackDialog';
import StudioMark from '../branding/StudioMark';

const SAGE_HEX = BRAND_PRESETS.find((preset) => preset.id === 'sage')?.hex ?? BRAND_PRESETS[0].hex;
const SAGE_HEX_LOWER = SAGE_HEX.toLowerCase();

type ColorMode = 'preset' | 'custom';

type FormState = {
  name: string;
  tagline: string;
  colorMode: ColorMode;
  presetId: string;
  customText: string;
  logoInSidebar: boolean;
  logoOnAuth: boolean;
  sidebarShowName: boolean;
  lastValidHex: string;
};

function colorStateFromTenant(brandColor: string | null): { mode: ColorMode; presetId: string; customText: string } {
  if (brandColor == null) {
    return { mode: 'preset', presetId: 'sage', customText: SAGE_HEX_LOWER };
  }
  const normalized = normalizeHex(brandColor);
  const preset = normalized ? BRAND_PRESETS.find((item) => item.hex === normalized) : undefined;
  if (preset) {
    return { mode: 'preset', presetId: preset.id, customText: preset.hex.toLowerCase() };
  }
  return {
    mode: 'custom',
    presetId: 'sage',
    customText: (normalized ?? brandColor).toLowerCase(),
  };
}

function formStateFromTenant(row: Tenant | null): FormState {
  if (!row) {
    const color = colorStateFromTenant(null);
    return {
      name: '',
      tagline: '',
      colorMode: color.mode,
      presetId: color.presetId,
      customText: color.customText,
      logoInSidebar: false,
      logoOnAuth: false,
      sidebarShowName: true,
      lastValidHex: SAGE_HEX,
    };
  }
  const color = colorStateFromTenant(row.brand_color);
  const initialHex = color.mode === 'preset'
    ? (BRAND_PRESETS.find((item) => item.id === color.presetId)?.hex ?? SAGE_HEX)
    : (normalizeHex(color.customText) ?? SAGE_HEX);
  return {
    name: row.name,
    tagline: row.tagline ?? '',
    colorMode: color.mode,
    presetId: color.presetId,
    customText: color.customText,
    logoInSidebar: row.logo_in_sidebar ?? false,
    logoOnAuth: row.logo_on_auth ?? false,
    sidebarShowName: row.sidebar_show_name ?? true,
    lastValidHex: initialHex && isBrandColorAllowed(initialHex) ? initialHex : SAGE_HEX,
  };
}

function resolvedBrandHex(mode: ColorMode, presetId: string, customText: string): string | null {
  if (mode === 'preset') {
    return BRAND_PRESETS.find((item) => item.id === presetId)?.hex ?? SAGE_HEX;
  }
  const normalized = normalizeHex(customText);
  if (!normalized || !isBrandColorAllowed(normalized)) return null;
  return normalized;
}

function colorError(mode: ColorMode, customText: string): string | null {
  if (mode !== 'custom') return null;
  const normalized = normalizeHex(customText);
  if (!normalized) return 'Bitte gib die Farbe im Format #RRGGBB an.';
  if (!isBrandColorAllowed(normalized)) {
    return 'Diese Farbe ist zu hell. Wähle eine dunklere Farbe, damit Texte gut lesbar bleiben.';
  }
  return null;
}

const StudioDesignSection: React.FC = () => {
  const { tenant, updateTenant } = useTenant();

  const [name, setName] = useState(() => formStateFromTenant(tenant).name);
  const [tagline, setTagline] = useState(() => formStateFromTenant(tenant).tagline);
  const [colorMode, setColorMode] = useState<ColorMode>(() => formStateFromTenant(tenant).colorMode);
  const [presetId, setPresetId] = useState(() => formStateFromTenant(tenant).presetId);
  const [customText, setCustomText] = useState(() => formStateFromTenant(tenant).customText);
  const [logoInSidebar, setLogoInSidebar] = useState(() => formStateFromTenant(tenant).logoInSidebar);
  const [logoOnAuth, setLogoOnAuth] = useState(() => formStateFromTenant(tenant).logoOnAuth);
  const [sidebarShowName, setSidebarShowName] = useState(() => formStateFromTenant(tenant).sidebarShowName);
  const [newLogoFile, setNewLogoFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [lastValidHex, setLastValidHex] = useState(() => formStateFromTenant(tenant).lastValidHex);
  const [saving, setSaving] = useState(false);
  const [feedbackDialog, setFeedbackDialog] = useState<FeedbackDialogState | null>(null);

  const applyFromTenant = (row: Tenant) => {
    const next = formStateFromTenant(row);
    setName(next.name);
    setTagline(next.tagline);
    setColorMode(next.colorMode);
    setPresetId(next.presetId);
    setCustomText(next.customText);
    setLogoInSidebar(next.logoInSidebar);
    setLogoOnAuth(next.logoOnAuth);
    setSidebarShowName(next.sidebarShowName);
    setLastValidHex(next.lastValidHex);
    setNewLogoFile(null);
    setRemoveLogo(false);
    setLogoError(null);
  };

  const resolvedHex = resolvedBrandHex(colorMode, presetId, customText);
  const brandError = colorError(colorMode, customText);
  const nameTrimmed = name.trim();
  const nameError = nameTrimmed.length < STUDIO_NAME_MIN
    ? 'Der Studioname muss zwischen 2 und 60 Zeichen lang sein.'
    : null;
  const colorToSave = resolvedHex === SAGE_HEX ? null : resolvedHex;

  useEffect(() => {
    if (!newLogoFile) {
      setObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(newLogoFile);
    setObjectUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [newLogoFile]);

  useEffect(() => {
    if (resolvedHex) setLastValidHex(resolvedHex);
  }, [resolvedHex]);

  const hasLogoChoice = Boolean(newLogoFile || (tenant?.logo_path && !removeLogo));
  const storedTagline = tenant?.tagline ?? '';
  const isDirty = Boolean(
    tenant && (
      nameTrimmed !== tenant.name
      || tagline.trim() !== storedTagline
      || colorToSave !== tenant.brand_color
      || logoInSidebar !== (tenant.logo_in_sidebar ?? false)
      || logoOnAuth !== (tenant.logo_on_auth ?? false)
      || sidebarShowName !== (tenant.sidebar_show_name ?? true)
      || newLogoFile !== null
      || removeLogo
    ),
  );
  const isDirtyRef = useRef(false);
  isDirtyRef.current = isDirty;
  const resyncRef = useRef(false);
  const lastSyncedRef = useRef<string | null>(tenant?.updated_at ?? null);

  useEffect(() => {
    if (!tenant) return;
    if (lastSyncedRef.current === null) {
      lastSyncedRef.current = tenant.updated_at;
      applyFromTenant(tenant);
      return;
    }
    const laterChange = tenant.updated_at !== lastSyncedRef.current;
    if (!laterChange && !resyncRef.current) return;
    if (resyncRef.current) {
      resyncRef.current = false;
      lastSyncedRef.current = tenant.updated_at;
      applyFromTenant(tenant);
      return;
    }
    if (isDirtyRef.current) return;
    lastSyncedRef.current = tenant.updated_at;
    applyFromTenant(tenant);
    // Nur spätere updated_at-Wechsel und das erste Tenant-Eintreffen nach null-Mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.updated_at]);

  const previewHex = resolvedHex ?? lastValidHex;
  const previewVars = useMemo(() => {
    try {
      return brandTokensToCssVars(deriveBrandTokens(previewHex));
    } catch {
      return brandTokensToCssVars(deriveBrandTokens(SAGE_HEX));
    }
  }, [previewHex]);

  const previewLogoUrl = objectUrl ?? (removeLogo ? null : getStudioLogoUrl(tenant?.logo_path));
  const canSave = Boolean(
    tenant && isDirty && !nameError && !brandError && !logoError && !saving && resolvedHex,
  );

  if (!tenant) return null;

  const handlePreset = (id: string) => {
    const preset = BRAND_PRESETS.find((item) => item.id === id);
    setColorMode('preset');
    setPresetId(id);
    if (preset) setCustomText(preset.hex.toLowerCase());
  };

  const handleCustomText = (value: string) => {
    setColorMode('custom');
    setCustomText(value);
  };

  const handleColorPicker = (value: string) => {
    setColorMode('custom');
    setCustomText(value.toLowerCase());
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const message = validateLogoFile(file);
    setLogoError(message);
    if (message) return;
    setNewLogoFile(file);
    setRemoveLogo(false);
  };

  const handleRemoveLogo = () => {
    setNewLogoFile(null);
    setRemoveLogo(true);
    setLogoError(null);
  };

  const handleSave = async () => {
    if (!tenant || !canSave || !resolvedHex) return;
    setSaving(true);
    try {
      const result = await saveStudioBranding({
        tenantId: tenant.id,
        name: nameTrimmed,
        brandColor: colorToSave,
        tagline,
        logoInSidebar,
        logoOnAuth,
        sidebarShowName,
        newLogoFile,
        removeLogo: removeLogo && !newLogoFile,
      });
      if (result.patch) updateTenant(result.patch);
      if (result.ok) {
        resyncRef.current = true;
        setNewLogoFile(null);
        setRemoveLogo(false);
        setLogoError(null);
        setFeedbackDialog({
          title: 'Gespeichert',
          message: 'Name und Design deines Studios sind gespeichert.',
          type: 'success',
        });
      } else {
        setFeedbackDialog({
          title: 'Speichern fehlgeschlagen',
          message: result.message,
          type: 'error',
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const pickerValue = (() => {
    const normalized = normalizeHex(customText);
    return (normalized ?? SAGE_HEX).toLowerCase();
  })();

  return (
    <div className="bg-surface rounded-md border border-border p-3.5 space-y-6">
      <FeedbackDialog dialog={feedbackDialog} onClose={() => setFeedbackDialog(null)} />

      <div>
        <h2 className="text-xl font-medium text-text">Studio & Design</h2>
        <p className="mt-1 text-[15px] text-textMuted">So sehen Teilnehmende dein Studio.</p>
      </div>

      <div>
        <label htmlFor="studio-name" className="block text-[15px] font-medium text-text mb-2">
          Studioname
        </label>
        <input
          id="studio-name"
          type="text"
          value={name}
          maxLength={STUDIO_NAME_MAX}
          onChange={(event) => setName(event.target.value)}
          className="w-full px-4 py-2 min-h-11 border border-border rounded-sm text-[15px] text-text focus:ring-2 focus:ring-brand focus:border-transparent"
        />
        <div className="mt-1 flex items-start justify-between gap-3">
          {nameError ? <p className="text-[13px] text-danger">{nameError}</p> : <span />}
          <p className="shrink-0 text-[13px] text-textMuted tabular-nums">{name.length}/{STUDIO_NAME_MAX}</p>
        </div>
      </div>

      <div>
        <label htmlFor="studio-tagline" className="block text-[15px] font-medium text-text mb-2">
          Kurzbeschreibung
        </label>
        <textarea
          id="studio-tagline"
          value={tagline}
          maxLength={TAGLINE_MAX}
          rows={3}
          onChange={(event) => setTagline(event.target.value)}
          className="w-full px-4 py-2 border border-border rounded-sm text-[15px] text-text focus:ring-2 focus:ring-brand focus:border-transparent"
        />
        <div className="mt-1 flex items-start justify-between gap-3">
          <p className="text-[13px] text-textMuted">Erscheint auf der Anmelde- und Beitrittsseite. Optional.</p>
          <p className="shrink-0 text-[13px] text-textMuted tabular-nums">{tagline.length}/{TAGLINE_MAX}</p>
        </div>
      </div>

      <fieldset>
        <legend className="text-[15px] font-medium text-text">Markenfarbe</legend>
        <p className="mt-1 mb-3 text-[13px] text-textMuted">
          Für Hauptknöpfe, aktiven Menüpunkt, Hervorhebungen und Datumsblöcke. Warn- und Statusfarben bleiben gleich.
        </p>
        <div role="radiogroup" aria-label="Markenfarbe" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {BRAND_PRESETS.map((preset) => {
            const checked = colorMode === 'preset' && presetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => handlePreset(preset.id)}
                className={`min-h-11 flex items-center gap-3 px-3 text-left rounded-sm border ${
                  checked ? 'border-brand' : 'border-border'
                }`}
              >
                <span
                  className="h-8 w-8 shrink-0 rounded-full border border-border"
                  style={{ backgroundColor: preset.hex }}
                  aria-hidden
                />
                <span className="text-[15px] font-medium text-text">{preset.label}</span>
                {checked ? <Check className="ml-auto h-4 w-4 text-brand" aria-hidden /> : null}
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={colorMode === 'custom'}
            onClick={() => setColorMode('custom')}
            className={`min-h-11 flex items-center gap-3 px-3 text-left rounded-sm border sm:col-span-2 ${
              colorMode === 'custom' ? 'border-brand' : 'border-border'
            }`}
          >
            <span
              className="h-8 w-8 shrink-0 rounded-full border border-border"
              style={{ backgroundColor: normalizeHex(customText) ?? SAGE_HEX }}
              aria-hidden
            />
            <span className="text-[15px] font-medium text-text">Eigene Farbe</span>
            {colorMode === 'custom' ? <Check className="ml-auto h-4 w-4 text-brand" aria-hidden /> : null}
          </button>
        </div>
        {colorMode === 'custom' ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={customText}
              onChange={(event) => handleCustomText(event.target.value)}
              placeholder="#2F5A4E"
              spellCheck={false}
              autoCapitalize="off"
              className="min-h-11 w-40 px-4 border border-border rounded-sm text-[15px] text-text tabular-nums focus:ring-2 focus:ring-brand focus:border-transparent"
            />
            <input
              type="color"
              value={pickerValue}
              onChange={(event) => handleColorPicker(event.target.value)}
              aria-label="Farbwähler"
              className="h-11 w-11 cursor-pointer rounded-sm border border-border bg-surface p-1"
            />
          </div>
        ) : null}
        {brandError ? <p className="mt-2 text-[13px] text-danger">{brandError}</p> : null}
      </fieldset>

      <div>
        <p className="text-[15px] font-medium text-text mb-2">Logo</p>
        <div className="flex h-28 items-center justify-center rounded-sm bg-surfaceSunken px-4">
          {previewLogoUrl ? (
            <img src={previewLogoUrl} alt="" className="max-h-24 w-auto max-w-full object-contain" />
          ) : (
            <p className="text-[15px] text-textMuted">Noch kein Logo</p>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            id="studio-logo-file"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={handleFileChange}
          />
          <label
            htmlFor="studio-logo-file"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-border px-5 text-[15px] font-medium text-text cursor-pointer"
          >
            Logo auswählen
          </label>
          {hasLogoChoice ? (
            <button
              type="button"
              onClick={handleRemoveLogo}
              className="inline-flex min-h-11 items-center px-2 text-[15px] font-medium text-textMuted"
            >
              Logo entfernen
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-[13px] text-textMuted">PNG, JPG oder WebP, höchstens 1 MB.</p>
        {logoError ? <p className="mt-1 text-[13px] text-danger">{logoError}</p> : null}
      </div>

      <div>
        <p className="text-[15px] font-medium text-text mb-2">Anzeige</p>
        {!hasLogoChoice ? (
          <p className="mb-2 text-[13px] text-textMuted">Lade zuerst ein Logo hoch.</p>
        ) : null}
        <div className="space-y-1">
          <label className={`flex min-h-11 items-center gap-3 ${hasLogoChoice ? 'cursor-pointer' : 'cursor-default opacity-60'}`}>
            <input
              type="checkbox"
              checked={logoInSidebar}
              disabled={!hasLogoChoice}
              onChange={(event) => setLogoInSidebar(event.target.checked)}
              className="h-4 w-4 rounded-sm border-border text-brand focus:ring-brand"
            />
            <span className="text-[15px] text-text">Logo in der Seitenleiste zeigen</span>
          </label>
          <label className={`flex min-h-11 items-center gap-3 ${hasLogoChoice && logoInSidebar ? 'cursor-pointer' : 'cursor-default opacity-60'}`}>
            <input
              type="checkbox"
              checked={sidebarShowName}
              disabled={!hasLogoChoice || !logoInSidebar}
              onChange={(event) => setSidebarShowName(event.target.checked)}
              className="h-4 w-4 rounded-sm border-border text-brand focus:ring-brand"
            />
            <span className="text-[15px] text-text">Studioname neben dem Logo zeigen</span>
          </label>
          <label className={`flex min-h-11 items-center gap-3 ${hasLogoChoice ? 'cursor-pointer' : 'cursor-default opacity-60'}`}>
            <input
              type="checkbox"
              checked={logoOnAuth}
              disabled={!hasLogoChoice}
              onChange={(event) => setLogoOnAuth(event.target.checked)}
              className="h-4 w-4 rounded-sm border-border text-brand focus:ring-brand"
            />
            <span className="text-[15px] text-text">Logo auf der Anmelde- und Beitrittsseite zeigen</span>
          </label>
        </div>
      </div>

      <div>
        <h3 className="text-[15px] font-medium text-text mb-3">Vorschau</h3>
        <div style={previewVars} className="grid gap-4 sm:grid-cols-2" aria-hidden>
          <div className="rounded-md border border-border bg-surface p-4">
            <p className="mb-3 text-[13px] font-medium text-textMuted">Seitenleiste</p>
            <StudioMark
              name={nameTrimmed || tenant.name}
              logoUrl={previewLogoUrl}
              showLogo={logoInSidebar}
              showName={sidebarShowName}
              variant="sidebar"
            />
            <div className="mt-4 space-y-2">
              <div className="flex min-h-11 items-center rounded-sm bg-brand px-4 text-[15px] font-medium text-onBrand">
                Übersicht
              </div>
              <div className="flex min-h-11 items-center rounded-sm px-4 text-[15px] text-textMuted">
                Kurse
              </div>
            </div>
          </div>
          <div className="rounded-md border border-border bg-surface p-4 text-center">
            <p className="mb-3 text-left text-[13px] font-medium text-textMuted">Anmeldeseite</p>
            <StudioMark
              name={nameTrimmed || tenant.name}
              logoUrl={previewLogoUrl}
              showLogo={logoOnAuth}
              showName={false}
              variant="auth"
            />
            <p className="text-2xl font-medium text-text">{nameTrimmed || tenant.name}</p>
            {tagline.trim() ? (
              <p className="mt-1 text-[15px] text-textMuted">{tagline.trim()}</p>
            ) : null}
            <div className="mt-4 inline-flex min-h-11 items-center rounded-full bg-brand px-6 text-[15px] font-medium text-onBrand">
              Anmelden
            </div>
            <div className="mt-4 flex justify-center">
              <div className="flex w-12 flex-col items-center justify-center rounded-sm bg-brandSoft py-1 text-center leading-tight text-brandOnSoft tabular-nums">
                <span className="text-[12px] font-normal">Do</span>
                <span className="text-[19px] font-medium">18</span>
                <span className="text-[12px] font-normal">Sep</span>
              </div>
            </div>
            <p className="mt-4 text-[15px] text-brand">Passwort vergessen?</p>
          </div>
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!canSave}
          className="bg-brand text-onBrand hover:bg-brandPressed rounded-full min-h-11 px-6 font-medium disabled:opacity-50"
        >
          {saving ? 'Wird gespeichert …' : 'Speichern'}
        </button>
      </div>
    </div>
  );
};

export default StudioDesignSection;
