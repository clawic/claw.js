"use client";

import MarkdownEditor from "@/components/markdown-editor";
import type { ProfileSection } from "@/lib/app-bootstrap";
import type { UserConfig } from "@/lib/user-config";
import { SelectInput, SettingField, TagsInput, TextInput } from "./settings-components";

export function SettingsProfileTab(props: {
  config: UserConfig;
  messages: any;
  profileSubTab: "basics" | "people" | "context";
  setProfileSubTab: (tab: "basics" | "people" | "context") => void;
  groupedProfileSections: Array<{ group: string; sections: ProfileSection[] }>;
  activeProfileSectionId: string;
  setActiveProfileSectionId: (id: string) => void;
  activeProfileSection: ProfileSection | null;
  setProfileSections: React.Dispatch<React.SetStateAction<ProfileSection[]>>;
  updateConfig: (updater: (config: UserConfig) => UserConfig) => void;
}) {
  const {
    config,
    messages,
    profileSubTab,
    setProfileSubTab,
    groupedProfileSections,
    activeProfileSectionId,
    setActiveProfileSectionId,
    activeProfileSection,
    setProfileSections,
    updateConfig,
  } = props;

  return (

  <div className="space-y-5">
    {/* Sub-tab navigation */}
    <div className="flex gap-5 px-5">
      {([
        { key: "basics" as const, label: messages.settings.profile.subTabBasics },
        { key: "people" as const, label: messages.settings.profile.subTabPeople },
        { key: "context" as const, label: messages.settings.profile.subTabContext },
      ]).map((st) => (
        <button key={st.key} type="button"
          onClick={() => setProfileSubTab(st.key)}
          className={`pb-1 text-xs transition-all border-b-2 ${
            profileSubTab === st.key
              ? "font-semibold text-foreground border-foreground"
              : "font-normal text-muted-foreground border-transparent hover:text-strong-foreground"
          }`}>
          {st.label}
        </button>
      ))}
    </div>

    {/* ── BASICS ── */}
    {profileSubTab === "basics" && (
      <div className="space-y-4">
        {/* Basic profile card */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="px-4 pt-4 pb-1">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{messages.settings.profile.basicProfile}</p>
            <p className="text-[10px] text-muted-foreground mb-3">{messages.settings.profile.basicProfileHint}</p>
          </div>
          <div className="px-4 pb-4">
          <div className="grid grid-cols-2 gap-3" data-testid="profile-basics">
            <SettingField label={messages.settings.profile.name}>
              <TextInput value={config.displayName}
                testId="profile-name-input"
                onChange={(v) => updateConfig((c) => ({ ...c, displayName: v, profileNameKey: v.toLowerCase() }))} />
            </SettingField>
            <SettingField label={messages.settings.profile.age}>
              <TextInput value={config.profileBasics?.age || ""}
                testId="profile-age-input"
                onChange={(v) => updateConfig((c) => ({
                  ...c,
                  profileBasics: {
                    age: v,
                    gender: c.profileBasics?.gender || "",
                    location: c.profileBasics?.location || "",
                    occupation: c.profileBasics?.occupation || "",
                  },
                }))} />
            </SettingField>
            <SettingField label={messages.settings.profile.gender}>
              <SelectInput value={config.profileBasics?.gender || ""}
                placeholder={messages.settings.profile.gender}
                onChange={(v) => updateConfig((c) => ({
                  ...c,
                  profileBasics: {
                    age: c.profileBasics?.age || "",
                    gender: v,
                    location: c.profileBasics?.location || "",
                    occupation: c.profileBasics?.occupation || "",
                  },
                }))}
                options={[
                  { value: "male", label: messages.settings.profile.genderMale },
                  { value: "female", label: messages.settings.profile.genderFemale },
                ]} />
            </SettingField>
            <SettingField label={messages.settings.profile.location}>
              <TextInput value={config.profileBasics?.location || ""}
                testId="profile-location-input"
                onChange={(v) => updateConfig((c) => ({
                  ...c,
                  profileBasics: {
                    age: c.profileBasics?.age || "",
                    gender: c.profileBasics?.gender || "",
                    location: v,
                    occupation: c.profileBasics?.occupation || "",
                  },
                }))} />
            </SettingField>
            <div className="col-span-2">
              <SettingField label={messages.settings.profile.occupation}>
                <TextInput value={config.profileBasics?.occupation || ""}
                  testId="profile-occupation-input"
                  onChange={(v) => updateConfig((c) => ({
                    ...c,
                    profileBasics: {
                      age: c.profileBasics?.age || "",
                      gender: c.profileBasics?.gender || "",
                      location: c.profileBasics?.location || "",
                      occupation: v,
                    },
                  }))} />
              </SettingField>
            </div>
          </div>
          </div>
        </div>
      </div>
    )}

    {/* ── PEOPLE ── */}
    {profileSubTab === "people" && (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          {messages.settings.people.intro}
        </p>

        {/* Priority contacts card */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="px-4 pt-4 pb-1">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{messages.settings.people.priorityContacts}</p>
            <p className="text-[10px] text-muted-foreground mb-3">{messages.settings.people.priorityContactsHint}</p>
          </div>
          <div className="px-4 pb-4 space-y-3">
            <div className="py-2 border-b border-border">
              <SettingField label={messages.settings.people.names}>
                <TagsInput value={config.priorityContacts.exactNames}
                  onChange={(v) => updateConfig((c) => ({ ...c, priorityContacts: { ...c.priorityContacts, exactNames: v } }))}
                  placeholder={messages.settings.people.namesPlaceholder} />
              </SettingField>
            </div>
            <div className="py-2">
              <SettingField label={messages.settings.people.keywords}>
                <TagsInput value={config.priorityContacts.patterns}
                  onChange={(v) => updateConfig((c) => ({ ...c, priorityContacts: { ...c.priorityContacts, patterns: v } }))}
                  placeholder={messages.settings.people.keywordsPlaceholder} />
              </SettingField>
            </div>
          </div>
        </div>

        {/* Family card */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="px-4 pt-4 pb-1">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{messages.settings.people.family}</p>
            <p className="text-[10px] text-muted-foreground mb-3">{messages.settings.people.familyHint}</p>
          </div>
          <div className="px-4 pb-4">
            <TagsInput value={config.closeRelationMatchers.patterns}
              onChange={(v) => updateConfig((c) => ({ ...c, closeRelationMatchers: { patterns: v } }))}
              placeholder={messages.settings.people.familyPlaceholder} />
          </div>
        </div>

        {/* Work card */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="px-4 pt-4 pb-1">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{messages.settings.people.work}</p>
            <p className="text-[10px] text-muted-foreground mb-3">{messages.settings.people.workHint}</p>
          </div>
          <div className="px-4 pb-4">
            <TagsInput value={config.workRelationMatchers.patterns}
              onChange={(v) => updateConfig((c) => ({ ...c, workRelationMatchers: { patterns: v } }))}
              placeholder={messages.settings.people.workPlaceholder} />
          </div>
        </div>
      </div>
    )}

    {/* ── CONTEXT ── */}
    {profileSubTab === "context" && (
      <div className="space-y-4">
    {/* Structured context files card */}
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]" data-testid="profile-sections">
      <div className="px-4 pt-4 pb-1">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{messages.settings.profile.structuredContextFiles}</p>
        <p className="text-[10px] text-muted-foreground mb-3">
          Use the selector to move through the main summary and the specific assistant dimensions. Each area is saved as its own file inside the local workspace profile directory.
        </p>
      </div>
      <div className="px-4 pb-4">
        {/* Section selector as flat pills */}
        <div className="flex flex-wrap gap-1.5 mb-5" data-testid="profile-nav">
          {groupedProfileSections.map((group) =>
            group.sections.map((section) => {
              const active = section.id === activeProfileSectionId;
              return (
                <button
                  key={section.id}
                  type="button"
                  data-testid={`profile-nav-${section.id}`}
                  onClick={() => setActiveProfileSectionId(section.id)}
                  className={`px-3 py-1.5 rounded-lg text-[13px] transition-all ${
                    active
                      ? "bg-foreground text-background font-medium shadow-sm"
                      : "bg-card text-strong-foreground hover:bg-muted"
                  }`}
                >
                  {section.title}
                  {section.isPrimary && (
                    <span className={`ml-1.5 text-[10px] ${active ? "text-muted-foreground" : "text-muted-foreground"}`}>
                      Main
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {activeProfileSection && (
          <div data-testid="profile-editor">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h3 className="text-sm font-medium text-strong-foreground">{activeProfileSection.title}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{activeProfileSection.description}</p>
              </div>
              <span className="text-[11px] text-muted-foreground whitespace-nowrap rounded-full bg-card px-2.5 py-1">
                {activeProfileSection.fileName}
              </span>
            </div>
            <MarkdownEditor
              key={activeProfileSection.id}
              value={activeProfileSection.content}
              data-testid={`profile-section-${activeProfileSection.id}`}
              onChange={(v) => setProfileSections((prev) => prev.map((item) =>
                item.id === activeProfileSection.id
                  ? { ...item, content: v }
                  : item
              ))}
              rows={14}
              placeholder={activeProfileSection.placeholder}
            />
          </div>
        )}
      </div>
    </div>
      </div>
    )}
  </div>

  );
}
