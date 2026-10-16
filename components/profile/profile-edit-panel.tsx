"use client";

import { useRef, useState } from "react";
import { Camera, X, AtSign, User, Phone, Mail, Calendar, Lock, Check } from "lucide-react";
import { PanelHeader } from "./panel-header";
import { T } from "./../theme";
import { updateProfileDetails } from "@/lib/actions/profile";
import { compressImage } from "@/lib/image";

interface ProfileData {
  id?: string;
  username?: string;
  display_name?: string;
  phone?: string;
  email?: string;
  avatar_url?: string;
  created_at?: string;
}

interface ProfileEditPanelProps {
  onBack: () => void;
  profile: ProfileData;
}

export function ProfileEditPanel({ onBack, profile }: ProfileEditPanelProps) {
  const [username, setUsername] = useState(profile?.username ?? "");
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImgLoading(true);
    try {
      const compressed = await compressImage(file, { maxDim: 256, quality: 0.8 });
      setAvatarUrl(compressed);
    } catch {
      setError("Could not process image. Try a different file.");
    } finally {
      setImgLoading(false);
      e.target.value = ""; // allow re-selecting the same file
    }
  };

  const avatarLabel = (displayName || username || "?")[0]?.toUpperCase() ?? "?";
  const signUpDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-GB")
    : "—";

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateProfileDetails({ username, displayName, phone, avatarUrl });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        background: T.bg,
        fontFamily: T.uiFont,
        maxWidth: "600px",
        margin: "0 auto",
        width: "100%",
      }}
    >
      <PanelHeader title="Profile" onBack={onBack} />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleImagePick}
      />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "20px 16px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        {/* ── Avatar hero ─────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={imgLoading}
              style={{
                width: 92,
                height: 92,
                borderRadius: 24,
                overflow: "hidden",
                border: `2px solid ${T.accentBorder}`,
                background: avatarUrl ? "transparent" : "rgba(242,154,11,0.12)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                boxShadow: "0 8px 28px rgba(242,154,11,0.18)",
              }}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontFamily: T.monoFont, fontSize: 34, fontWeight: 900, color: T.accent }}>
                  {avatarLabel}
                </span>
              )}
            </button>

            {/* Camera badge */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={imgLoading}
              aria-label="Change photo"
              style={{
                position: "absolute",
                bottom: -4,
                right: -4,
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: T.accent,
                border: `2px solid ${T.bg}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <Camera size={14} color="#1b1305" />
            </button>

            {/* Remove */}
            {avatarUrl && !imgLoading && (
              <button
                type="button"
                onClick={() => setAvatarUrl("")}
                aria-label="Remove photo"
                style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "#ff5d73",
                  border: `2px solid ${T.bg}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <X size={11} color="#fff" />
              </button>
            )}
          </div>

          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: T.textPrimary, letterSpacing: -0.2 }}>
              {displayName || username || "Set nickname"}
            </p>
            {profile?.email && (
              <p style={{ marginTop: 2, fontSize: 11, color: T.textMuted }}>{profile.email}</p>
            )}
            <p style={{ marginTop: 6, fontSize: 10, fontWeight: 700, color: T.accent, letterSpacing: 0.3 }}>
              {imgLoading ? "Processing…" : avatarUrl ? "TAP TO CHANGE PHOTO" : "TAP TO UPLOAD PHOTO"}
            </p>
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: T.radius.md,
              background: "rgba(255,93,115,0.08)",
              border: "1px solid rgba(255,93,115,0.2)",
              fontSize: 12,
              color: "#ff5d73",
            }}
          >
            {error}
          </div>
        )}

        {/* ── Editable details ────────────────────────── */}
        <Section title="Account details">
          <InputField
            icon={<AtSign size={14} />}
            label="Username"
            hint="3–20 chars"
            value={username}
            onChange={(v) => setUsername(v.toLowerCase())}
            placeholder="your_username"
            maxLength={20}
          />
          <InputField
            icon={<User size={14} />}
            label="Display name"
            hint="Shown to other players"
            value={displayName}
            onChange={setDisplayName}
            placeholder="Enter display name"
            maxLength={40}
          />
          <InputField
            icon={<Phone size={14} />}
            label="Phone"
            hint="Required for withdrawals"
            value={phone}
            onChange={setPhone}
            placeholder="e.g. +92 300 1234567"
            type="tel"
          />
        </Section>

        {/* ── Read-only info ──────────────────────────── */}
        <Section title="Account info">
          <InputField icon={<Mail size={14} />} label="Email" hint="Unchangeable" value={profile?.email ?? "—"} readOnly />
          <InputField icon={<Calendar size={14} />} label="Sign up date" hint="Unchangeable" value={signUpDate} readOnly />
        </Section>
      </div>

      {/* Pinned action bar — sits flush above the bottom nav */}
      <div
        style={{
          flexShrink: 0,
          padding: "10px 16px",
          background: T.bgMid,
          borderTop: `1px solid ${T.border}`,
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          zIndex: 20,
        }}
      >
        <button
          onClick={onBack}
          style={{
            height: 38,
            padding: "0 18px",
            borderRadius: 10,
            background: "transparent",
            border: `1px solid ${T.border}`,
            color: T.textSub,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: T.uiFont,
          }}
        >
          Back
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            height: 38,
            padding: "0 22px",
            borderRadius: 10,
            background: saving ? "rgba(242,154,11,0.5)" : saved ? "#22c55e" : T.accent,
            border: "none",
            color: saved ? "#fff" : "#1b1305",
            fontSize: 12,
            fontWeight: 800,
            cursor: saving ? "default" : "pointer",
            fontFamily: T.uiFont,
            letterSpacing: 0.2,
            transition: "background 0.15s",
          }}
        >
          {saved && <Check size={14} />}
          {saving ? "Saving…" : saved ? "Saved" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        borderRadius: T.radius.lg,
        background: T.bgCard,
        border: `1px solid ${T.border}`,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <p style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.4, color: T.textMuted }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function InputField({
  icon,
  label,
  hint,
  value,
  onChange,
  placeholder,
  maxLength,
  type,
  readOnly,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: T.textSub }}>
          {label}
        </span>
        {hint && <span style={{ fontSize: 9, color: T.textMuted }}>{hint}</span>}
      </div>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <span style={{ position: "absolute", left: 12, display: "flex", color: readOnly ? T.textMuted : T.accent }}>
          {icon}
        </span>
        <input
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          placeholder={placeholder}
          maxLength={maxLength}
          type={type}
          readOnly={readOnly}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "11px 14px 11px 38px",
            paddingRight: readOnly ? 34 : 14,
            borderRadius: 12,
            background: readOnly ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)",
            border: `1px solid rgba(255,255,255,0.07)`,
            color: readOnly ? T.textSub : "#f4f1ff",
            fontSize: 12,
            fontFamily: T.uiFont,
            outline: "none",
          }}
        />
        {readOnly && (
          <Lock size={11} style={{ position: "absolute", right: 12, color: T.textMuted }} />
        )}
      </div>
    </div>
  );
}
