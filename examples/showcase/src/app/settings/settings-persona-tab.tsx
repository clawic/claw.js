"use client";

import type { UserConfig } from "@/lib/user-config";
import { BookOpen, Brain, Clock, Compass, Ear, Eye, Feather, Gauge, Heart, MessageSquare, Scale, Smile, Sparkles, Swords, Target, Users, Zap } from "lucide-react";
import { SelectInput, SettingField, TagsInput, TextInput, Toggle, TripleOptionSelector } from "./settings-components";

type PersonaSubTab = "essentials" | "approach" | "style" | "session" | "safety";

export function SettingsPersonaTab(props: {
  config: UserConfig;
  messages: any;
  personaSubTab: PersonaSubTab;
  setPersonaSubTab: (tab: PersonaSubTab) => void;
  updateConfig: (updater: (config: UserConfig) => UserConfig) => void;
}) {
  const { config, messages, personaSubTab, setPersonaSubTab, updateConfig } = props;

  return (

  <div className="space-y-5">
    {/* Sub-tab navigation */}
    <div className="flex gap-5 px-5">
      {([
        { key: "essentials" as const, label: messages.settings.persona.subTabEssentials },
        { key: "approach" as const, label: messages.settings.persona.subTabApproach },
        { key: "style" as const, label: messages.settings.persona.subTabStyle },
        { key: "session" as const, label: messages.settings.persona.subTabSession },
        { key: "safety" as const, label: messages.settings.persona.subTabSafety },
      ]).map((st) => (
        <button key={st.key} type="button"
          onClick={() => setPersonaSubTab(st.key)}
          className={`pb-1 text-xs transition-all border-b-2 ${
            personaSubTab === st.key
              ? "font-semibold text-foreground border-foreground"
              : "font-normal text-muted-foreground border-transparent hover:text-strong-foreground"
          }`}>
          {st.label}
        </button>
      ))}
    </div>

    {/* ── ESSENTIALS ── */}
    {personaSubTab === "essentials" && (
      <div className="space-y-4">
        {/* Identity card */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]" data-testid="profile-basics-card">
          <div className="px-4 pt-4 pb-1">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{messages.settings.persona.assistantPersona}</p>
            <p className="text-[10px] text-muted-foreground mb-3">{messages.settings.persona.assistantPersonaHint}</p>
          </div>
          <div className="px-4 pb-4">
            <div className="grid grid-cols-2 gap-3">
              <SettingField label={messages.settings.persona.assistantName}>
                <TextInput value={config.assistantPersona?.name || ""}
                  placeholder={messages.settings.persona.assistantNamePlaceholder}
                  onChange={(v) => updateConfig((c) => ({
                    ...c,
                    assistantPersona: { ...c.assistantPersona, name: v, gender: c.assistantPersona?.gender || "" },
                  }))} />
              </SettingField>
              <SettingField label={messages.settings.persona.assistantGender}>
                <SelectInput value={config.assistantPersona?.gender || ""}
                  placeholder={messages.settings.persona.assistantGender}
                  onChange={(v) => updateConfig((c) => ({
                    ...c,
                    assistantPersona: { ...c.assistantPersona, name: c.assistantPersona?.name || "", gender: v },
                  }))}
                  options={[
                    { value: "male", label: messages.settings.persona.assistantGenderMale },
                    { value: "female", label: messages.settings.persona.assistantGenderFemale },
                  ]} />
              </SettingField>
              <SettingField label={messages.settings.persona.assistantApparentAge} hint={messages.settings.persona.assistantApparentAgeHint}>
                <SelectInput value={config.assistantPersona?.apparentAge || ""}
                  placeholder={messages.settings.persona.assistantApparentAge}
                  onChange={(v) => updateConfig((c) => ({ ...c, assistantPersona: { ...c.assistantPersona, name: c.assistantPersona?.name || "", gender: c.assistantPersona?.gender || "", apparentAge: (v || undefined) as typeof c.assistantPersona extends undefined ? never : typeof v extends "" ? undefined : "young" | "middle-aged" | "senior" } }))}
                  options={[
                    { value: "young", label: messages.settings.persona.apparentAgeYoung },
                    { value: "middle-aged", label: messages.settings.persona.apparentAgeMiddle },
                    { value: "senior", label: messages.settings.persona.apparentAgeSenior },
                  ]} />
              </SettingField>
              <div className="col-span-2">
                <SettingField label={messages.settings.persona.assistantLanguage}>
                  <TextInput value={config.assistantPersona?.language || ""}
                    placeholder={messages.settings.persona.assistantLanguagePlaceholder}
                    onChange={(v) => updateConfig((c) => ({ ...c, assistantPersona: { ...c.assistantPersona, name: c.assistantPersona?.name || "", gender: c.assistantPersona?.gender || "", language: v || undefined } }))} />
                </SettingField>
              </div>
            </div>
          </div>
        </div>

        {/* Orientation card */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="px-4 pt-4 pb-1">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{messages.settings.persona.guidanceStyle}</p>
            <p className="text-[10px] text-muted-foreground mb-3">{messages.settings.persona.guidanceStyleHint}</p>
          </div>
          <div className="px-4 pb-4 space-y-4">
            <div>
              <label className="block text-[11px] font-medium text-strong-foreground mb-2">{messages.settings.persona.guidanceStyle}</label>
              <TripleOptionSelector
                value={config.chat.guidanceStyle || "balanced"}
                onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, guidanceStyle: v as "guiding" | "reflective" | "balanced" } }))}
                options={[
                  { value: "guiding", label: messages.settings.persona.styleGuiding, desc: messages.settings.persona.styleGuidingDesc, icon: Compass },
                  { value: "balanced", label: messages.settings.persona.styleBalanced, desc: messages.settings.persona.styleBalancedDesc, icon: Scale },
                  { value: "reflective", label: messages.settings.persona.styleReflective, desc: messages.settings.persona.styleReflectiveDesc, icon: Ear },
                ]} />
            </div>
            <div className="h-px bg-muted" />
            <div>
              <label className="block text-[11px] font-medium text-strong-foreground mb-2">{messages.settings.persona.emotionalTone}</label>
              <TripleOptionSelector
                value={config.chat.emotionalTone || "balanced"}
                onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, emotionalTone: v as "warm" | "direct" | "balanced" } }))}
                options={[
                  { value: "warm", label: messages.settings.persona.toneWarm, desc: messages.settings.persona.toneWarmDesc, icon: Heart },
                  { value: "balanced", label: messages.settings.persona.toneBalanced, desc: messages.settings.persona.toneBalancedDesc, icon: Scale },
                  { value: "direct", label: messages.settings.persona.toneDirect, desc: messages.settings.persona.toneDirectDesc, icon: Zap },
                ]} />
            </div>
          </div>
        </div>

        {/* Topics card */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="px-4 pt-4 pb-1">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">{messages.settings.persona.suggestedTopics}</p>
          </div>
          <div className="px-4 pb-4 space-y-3">
            <div className="py-2 border-b border-border">
              <SettingField label={messages.settings.persona.suggestedTopics}>
                <TagsInput value={config.chat.suggestedTopics}
                  onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, suggestedTopics: v } }))}
                  placeholder={messages.settings.persona.suggestedTopicsPlaceholder} />
              </SettingField>
            </div>
            <div className="py-2 border-b border-border">
              <SettingField label={messages.settings.persona.focusTopics} hint={messages.settings.persona.focusTopicsHint}>
                <TagsInput value={config.chat.focusTopics ?? []}
                  onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, focusTopics: v } }))}
                  placeholder={messages.settings.persona.focusTopicsPlaceholder} />
              </SettingField>
            </div>
            <div className="py-2">
              <SettingField label={messages.settings.persona.topicsToAvoid} hint={messages.settings.persona.topicsToAvoidHint}>
                <TagsInput value={config.chat.neverMention}
                  onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, neverMention: v } }))}
                  placeholder={messages.settings.persona.topicsToAvoidPlaceholder} />
              </SettingField>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* ── APPROACH ── */}
    {personaSubTab === "approach" && (
      <div className="space-y-4">
        {/* Depth & techniques card */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="px-4 pt-4 pb-4 space-y-4">
            <div>
              <label className="block text-[11px] font-medium text-strong-foreground mb-2">{messages.settings.persona.depthLevel}</label>
              <TripleOptionSelector
                value={config.chat.depthLevel || "moderate"}
                onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, depthLevel: v as "surface" | "moderate" | "deep" } }))}
                options={[
                  { value: "surface", label: messages.settings.persona.depthSurface, desc: messages.settings.persona.depthSurfaceDesc, icon: Eye },
                  { value: "moderate", label: messages.settings.persona.depthModerate, desc: messages.settings.persona.depthModerateDesc, icon: Scale },
                  { value: "deep", label: messages.settings.persona.depthDeep, desc: messages.settings.persona.depthDeepDesc, icon: Brain },
                ]} />
            </div>
            <div className="h-px bg-muted" />
            <div>
              <label className="block text-[11px] font-medium text-strong-foreground mb-2">{messages.settings.persona.exerciseFrequency}</label>
              <TripleOptionSelector
                value={config.chat.exerciseFrequency || "sometimes"}
                onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, exerciseFrequency: v as "never" | "sometimes" | "frequent" } }))}
                options={[
                  { value: "never", label: messages.settings.persona.exerciseNever, desc: "", icon: Feather },
                  { value: "sometimes", label: messages.settings.persona.exerciseSometimes, desc: "", icon: Scale },
                  { value: "frequent", label: messages.settings.persona.exerciseFrequent, desc: "", icon: Target },
                ]} />
            </div>
            <div className="h-px bg-muted" />
            <div>
              <label className="block text-[11px] font-medium text-strong-foreground mb-2">{messages.settings.persona.metaphorUse}</label>
              <TripleOptionSelector
                value={config.chat.metaphorUse || "moderate"}
                onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, metaphorUse: v as "low" | "moderate" | "frequent" } }))}
                options={[
                  { value: "low", label: messages.settings.persona.metaphorLow, desc: "", icon: Feather },
                  { value: "moderate", label: messages.settings.persona.metaphorModerate, desc: "", icon: Scale },
                  { value: "frequent", label: messages.settings.persona.metaphorFrequent, desc: "", icon: Sparkles },
                ]} />
            </div>
          </div>
        </div>
      </div>
    )}

    {/* ── STYLE ── */}
    {personaSubTab === "style" && (
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="px-4 pt-4 pb-4 space-y-4">
        <div>
          <label className="block text-[11px] font-medium text-strong-foreground mb-2">{messages.settings.persona.responseLength}</label>
          <TripleOptionSelector
            value={config.chat.responseLength || "moderate"}
            onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, responseLength: v as "brief" | "moderate" | "extended" } }))}
            options={[
              { value: "brief", label: messages.settings.persona.responseBrief, desc: messages.settings.persona.responseBriefDesc, icon: MessageSquare },
              { value: "moderate", label: messages.settings.persona.responseModerate, desc: messages.settings.persona.responseModerateDesc, icon: Scale },
              { value: "extended", label: messages.settings.persona.responseExtended, desc: messages.settings.persona.responseExtendedDesc, icon: BookOpen },
            ]} />
        </div>

        <div className="h-px bg-muted" />
        <div>
          <label className="block text-[11px] font-medium text-strong-foreground mb-2">{messages.settings.persona.formalityLevel}</label>
          <TripleOptionSelector
            value={config.chat.formalityLevel || "neutral"}
            onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, formalityLevel: v as "informal" | "neutral" | "formal" } }))}
            options={[
              { value: "informal", label: messages.settings.persona.formalityInformal, desc: messages.settings.persona.formalityInformalDesc, icon: Smile },
              { value: "neutral", label: messages.settings.persona.formalityNeutral, desc: messages.settings.persona.formalityNeutralDesc, icon: Scale },
              { value: "formal", label: messages.settings.persona.formalityFormal, desc: messages.settings.persona.formalityFormalDesc, icon: BookOpen },
            ]} />
        </div>

        <div className="h-px bg-muted" />
        <div>
          <label className="block text-[11px] font-medium text-strong-foreground mb-2">{messages.settings.persona.humorUse}</label>
          <TripleOptionSelector
            value={config.chat.humorUse || "never"}
            onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, humorUse: v as "never" | "occasional" | "frequent" } }))}
            options={[
              { value: "never", label: messages.settings.persona.humorNever, desc: "", icon: Feather },
              { value: "occasional", label: messages.settings.persona.humorOccasional, desc: "", icon: Smile },
              { value: "frequent", label: messages.settings.persona.humorFrequent, desc: "", icon: Sparkles },
            ]} />
        </div>

        <div className="h-px bg-muted" />
        <div>
          <label className="block text-[11px] font-medium text-strong-foreground mb-2">{messages.settings.persona.progressSpeed}</label>
          <TripleOptionSelector
            value={config.chat.progressSpeed || "moderate"}
            onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, progressSpeed: v as "patient" | "moderate" | "direct" } }))}
            options={[
              { value: "patient", label: messages.settings.persona.progressPatient, desc: messages.settings.persona.progressPatientDesc, icon: Clock },
              { value: "moderate", label: messages.settings.persona.progressModerate, desc: messages.settings.persona.progressModerateDesc, icon: Scale },
              { value: "direct", label: messages.settings.persona.progressDirect, desc: messages.settings.persona.progressDirectDesc, icon: Zap },
            ]} />
        </div>

        <div className="h-px bg-muted" />
        <div>
          <label className="block text-[11px] font-medium text-strong-foreground mb-2">{messages.settings.persona.confrontationLevel}</label>
          <TripleOptionSelector
            value={config.chat.confrontationLevel || "moderate"}
            onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, confrontationLevel: v as "gentle" | "moderate" | "confrontational" } }))}
            options={[
              { value: "gentle", label: messages.settings.persona.confrontationGentle, desc: messages.settings.persona.confrontationGentleDesc, icon: Heart },
              { value: "moderate", label: messages.settings.persona.confrontationModerate, desc: messages.settings.persona.confrontationModerateDesc, icon: Scale },
              { value: "confrontational", label: messages.settings.persona.confrontationHigh, desc: messages.settings.persona.confrontationHighDesc, icon: Swords },
            ]} />
        </div>
        </div>
      </div>
    )}

    {/* ── SESSION ── */}
    {personaSubTab === "session" && (
      <div className="space-y-4">
        {/* Duration & structure card */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="px-4 pt-4 pb-4 space-y-4">
            <SettingField label={messages.settings.persona.sessionDuration} hint={messages.settings.persona.sessionDurationHint}>
              <div className="grid grid-cols-4 gap-2">
                {(["15min", "30min", "45min", "unlimited"] as const).map((dur) => {
                  const labels: Record<string, string> = { "15min": messages.settings.persona.duration15, "30min": messages.settings.persona.duration30, "45min": messages.settings.persona.duration45, unlimited: messages.settings.persona.durationUnlimited };
                  const selected = (config.chat.sessionDuration || "unlimited") === dur;
                  return (
                    <button key={dur} type="button"
                      onClick={() => updateConfig((c) => ({ ...c, chat: { ...c.chat, sessionDuration: dur } }))}
                      className={`px-3 py-2 rounded-lg text-xs border transition-colors duration-200 ${
                        selected
                          ? "border-[1.5px] border-foreground bg-foreground/[0.04] text-foreground font-medium"
                          : "border-border/70 bg-background text-foreground hover:border-muted-foreground"
                      }`}>
                      {labels[dur]}
                    </button>
                  );
                })}
              </div>
            </SettingField>

            <div className="h-px bg-muted" />

            <div>
              <label className="block text-[11px] font-medium text-strong-foreground mb-2">{messages.settings.persona.sessionStructure}</label>
              <TripleOptionSelector
                value={config.chat.sessionStructure || "free"}
                onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, sessionStructure: v as "free" | "semi-structured" | "structured" } }))}
                options={[
                  { value: "free", label: messages.settings.persona.structureFree, desc: messages.settings.persona.structureFreeDesc, icon: Feather },
                  { value: "semi-structured", label: messages.settings.persona.structureSemi, desc: messages.settings.persona.structureSemiDesc, icon: Scale },
                  { value: "structured", label: messages.settings.persona.structureStructured, desc: messages.settings.persona.structureStructuredDesc, icon: Target },
                ]} />
            </div>
          </div>
        </div>

        {/* Toggles card */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
            <div>
              <div className="text-xs font-medium text-strong-foreground">{messages.settings.persona.postSessionSummary}</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{messages.settings.persona.postSessionSummaryHint}</p>
            </div>
            <Toggle enabled={config.chat.postSessionSummary ?? false}
              onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, postSessionSummary: v } }))} />
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <div className="text-xs font-medium text-strong-foreground">{messages.settings.persona.interSessionFollowUp}</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{messages.settings.persona.interSessionFollowUpHint}</p>
            </div>
            <Toggle enabled={config.chat.interSessionFollowUp ?? false}
              onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, interSessionFollowUp: v } }))} />
          </div>
        </div>
      </div>
    )}

    {/* ── SAFETY ── */}
    {personaSubTab === "safety" && (
      <div className="space-y-4">
        {/* Autonomy & reminders card */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="px-4 pt-4 pb-4 space-y-4">
            <div>
              <label className="block text-[11px] font-medium text-strong-foreground mb-2">{messages.settings.persona.userAutonomy}</label>
              <TripleOptionSelector
                value={config.chat.userAutonomy || "collaborative"}
                onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, userAutonomy: v as "active-guidance" | "collaborative" | "user-led" } }))}
                options={[
                  { value: "active-guidance", label: messages.settings.persona.autonomyActiveGuidance, desc: messages.settings.persona.autonomyActiveGuidanceDesc, icon: Compass },
                  { value: "collaborative", label: messages.settings.persona.autonomyCollaborative, desc: messages.settings.persona.autonomyCollaborativeDesc, icon: Users },
                  { value: "user-led", label: messages.settings.persona.autonomyUserLed, desc: messages.settings.persona.autonomyUserLedDesc, icon: Gauge },
                ]} />
            </div>

            <div className="h-px bg-muted" />

            <div>
              <label className="block text-[11px] font-medium text-strong-foreground mb-2">{messages.settings.persona.aiReminders}</label>
              <TripleOptionSelector
                value={config.chat.aiReminders || "never"}
                onChange={(v) => updateConfig((c) => ({ ...c, chat: { ...c.chat, aiReminders: v as "never" | "start" | "periodically" } }))}
                options={[
                  { value: "never", label: messages.settings.persona.aiRemindersNever, desc: "", icon: Feather },
                  { value: "start", label: messages.settings.persona.aiRemindersStart, desc: "", icon: MessageSquare },
                  { value: "periodically", label: messages.settings.persona.aiRemindersPeriodically, desc: "", icon: Clock },
                ]} />
            </div>
          </div>
        </div>

      </div>
    )}

  </div>

  );
}
