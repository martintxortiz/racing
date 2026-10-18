"use client";

import { useQuery } from "convex/react";

import SettingsRow from "@/components/dashboard/settings/settings-row";
import SettingsSection from "@/components/dashboard/settings/settings-section";
import SettingsShell from "@/components/dashboard/settings/settings-shell";
import { api } from "@/convex/_generated/api";

const AccountSettingsPage = () => {
  const me = useQuery(api.users.me);

  return (
    <SettingsShell>
      <SettingsSection
        title="Account"
        description="Manage your account details and public profile."
      >
        <SettingsRow
          label="Username"
          value={me?.username ? `@${me.username}` : "—"}
          action="Change Username"
        />
        <SettingsRow
          label="Email"
          value={me?.email ?? "—"}
          action="Change Email"
        />
        <SettingsRow label="Subscription" value="Free" action="Upgrade" />
        <SettingsRow label="Profile visibility" value="Public" action="Change" />
      </SettingsSection>

      <SettingsSection title="Security">
        <SettingsRow
          label="Password Sign In"
          value="Reset your password"
          action="Reset Password"
        />
        <SettingsRow
          label="Google Sign in"
          value={me?.email ?? "—"}
          action="Disable"
        />
        <SettingsRow
          label="Multi-factor authentication"
          value="Not enabled"
          action="Enable"
          variant="white"
        />
      </SettingsSection>

      <SettingsSection title="Danger">
        <SettingsRow
          label="Delete Account"
          value="Permanently delete your account and all data"
          action="Delete Account"
          variant="danger"
        />
      </SettingsSection>
    </SettingsShell>
  );
};

export default AccountSettingsPage;
