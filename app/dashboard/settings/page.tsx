"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";

import AvatarEditor from "@/components/dashboard/settings/avatar-editor";
import ConfirmDisableGoogleDialog from "@/components/dashboard/settings/confirm-disable-google-dialog";
import EditFieldDialog from "@/components/dashboard/settings/edit-field-dialog";
import ResetPasswordDialog from "@/components/dashboard/settings/reset-password-dialog";
import SetPasswordDialog from "@/components/dashboard/settings/set-password-dialog";
import SettingsRow from "@/components/dashboard/settings/settings-row";
import SettingsSection from "@/components/dashboard/settings/settings-section";
import SettingsShell from "@/components/dashboard/settings/settings-shell";
import UsernameStatus from "@/components/dashboard/settings/username-status";
import { api } from "@/convex/_generated/api";
import { getErrorMessage } from "@/lib/error-message";

const AccountSettingsPage = () => {
  const { signIn } = useAuthActions();
  const me = useQuery(api.users.me);
  const loading = me === undefined;
  const updateUsername = useMutation(api.users.updateUsername);
  const setPassword = useAction(api.users.setPassword);
  const prepareGoogleLink = useMutation(api.users.prepareGoogleLink);
  const unlinkGoogle = useMutation(api.users.unlinkGoogle);
  const [usernameDialogOpen, setUsernameDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [googleConfirmOpen, setGoogleConfirmOpen] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const [securityError, setSecurityError] = useState<string | null>(null);

  const handlePasswordAction = () => {
    setSecurityError(null);
    if (me?.hasPassword) {
      setResetPasswordDialogOpen(true);
      return;
    }
    setPasswordDialogOpen(true);
  };

  const handleGoogleAction = async () => {
    setSecurityError(null);
    if (me?.hasGoogle) {
      setGoogleConfirmOpen(true);
      return;
    }
    setGooglePending(true);
    try {
      await prepareGoogleLink();
      const result = await signIn("google", {
        redirectTo: "/dashboard/settings",
      });
      if (!result.redirect && !result.signingIn) setGooglePending(false);
    } catch (error) {
      setSecurityError(getErrorMessage(error));
      setGooglePending(false);
    }
  };

  const handleDisableGoogle = async () => {
    setGooglePending(true);
    setSecurityError(null);
    try {
      await unlinkGoogle();
      setGoogleConfirmOpen(false);
    } catch (error) {
      setSecurityError(getErrorMessage(error));
    } finally {
      setGooglePending(false);
    }
  };

  return (
    <SettingsShell>
      <SettingsSection title="Account">
        <SettingsRow
          label="Username"
          value={me?.username ? `@${me.username}` : "—"}
          action="Change Username"
          onAction={() => setUsernameDialogOpen(true)}
          leading={<AvatarEditor src={me?.image} name={me?.username} />}
        />
        <SettingsRow
          label="Email"
          value={me?.email ?? "—"}
          action="Change Email"
        />
        <SettingsRow
          label="Subscription"
          value="Free"
          action="Upgrade"
          variant={"white"}
        />
        <SettingsRow
          label="Profile visibility"
          value="Public"
          action="Change"
        />
      </SettingsSection>

      <EditFieldDialog
        open={usernameDialogOpen}
        onOpenChange={setUsernameDialogOpen}
        title="Change Username"
        description="Pick a new username for your account."
        label="Username"
        placeholder="New username"
        defaultValue={me?.username ?? ""}
        status={({ value, setSubmittable }) => (
          <UsernameStatus
            value={value}
            currentUsername={me?.username ?? undefined}
            onSubmittableChange={setSubmittable}
          />
        )}
        onSubmit={async (value) => {
          await updateUsername({ username: value });
        }}
      />

      <SettingsSection title="Security">
        <SettingsRow
          label="Password Sign In"
          value={
            me?.hasPassword
              ? "Request a password change by email"
              : "No password set"
          }
          action={me?.hasPassword ? "Reset Password" : "Enable"}
          variant={loading || me?.hasPassword ? undefined : "white"}
          loading={loading}
          onAction={handlePasswordAction}
        />
        <SettingsRow
          label="Google Sign in"
          value={me?.googleEmail ?? "No Google account connected"}
          variant={loading || me?.hasGoogle ? undefined : "white"}
          action={
            loading
              ? "Enable"
              : me
                ? me.hasGoogle
                  ? "Disable"
                  : "Enable"
                : undefined
          }
          disabled={Boolean(me?.hasGoogle && !me.hasPassword)}
          loading={loading || googlePending}
          onAction={handleGoogleAction}
        />
        {securityError && !googleConfirmOpen && (
          <p role="alert" className="text-sm text-destructive">
            {securityError}
          </p>
        )}
        <SettingsRow
          label="Multi-factor authentication"
          value="Not enabled"
          action="Enable"
          variant="white"
        />
      </SettingsSection>

      <SetPasswordDialog
        open={passwordDialogOpen}
        onOpenChange={setPasswordDialogOpen}
        onSubmit={(password) => setPassword({ password })}
      />

      <ResetPasswordDialog
        open={resetPasswordDialogOpen}
        onOpenChange={setResetPasswordDialogOpen}
      />

      <ConfirmDisableGoogleDialog
        open={googleConfirmOpen}
        onOpenChange={(open) => {
          if (!googlePending) setGoogleConfirmOpen(open);
        }}
        loading={googlePending}
        error={securityError}
        onConfirm={handleDisableGoogle}
      />

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
