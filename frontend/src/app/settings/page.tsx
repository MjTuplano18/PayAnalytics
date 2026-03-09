"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import {
  listUsers,
  createUser,
  changePassword,
  type UserResponse,
} from "@/lib/api";
import { Eye, EyeOff, Plus, Shield, Lock } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsPage() {
  const { user, token } = useAuth();

  return (
    <div className="p-4 sm:p-8 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
        Settings
      </h1>

      <ChangePasswordSection token={token} />

      {user?.is_superuser && (
        <UserManagementSection token={token} currentUserId={user?.id} />
      )}
    </div>
  );
}

/* ─── Change Password ─── */
function ChangePasswordSection({ token }: { token: string | null }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();

    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (!token) return;

    setIsSubmitting(true);
    try {
      await changePassword(token, {
        current_password: currentPassword,
        new_password: newPassword,
      });
      toast.success("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Lock className="h-5 w-5 text-purple-400" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Change Password
        </h2>
      </div>

      <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
        <div className="space-y-2">
          <Label className="text-gray-700 dark:text-gray-300">Current Password</Label>
          <div className="relative">
            <Input
              type={showCurrent ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-gray-700 dark:text-gray-300">New Password</Label>
          <div className="relative">
            <Input
              type={showNew ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              placeholder="Min. 8 characters"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-gray-700 dark:text-gray-300">Confirm New Password</Label>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isSubmitting ? "Updating…" : "Update Password"}
        </button>
      </form>
    </Card>
  );
}

/* ─── User Management (Admin) ─── */
function UserManagementSection({
  token,
  currentUserId,
}: {
  token: string | null;
  currentUserId: string | undefined;
}) {
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  // New user form
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!token) return;
    listUsers(token)
      .then(setUsers)
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : "Failed to load users.")
      )
      .finally(() => setIsLoadingUsers(false));
  }, [token]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    setIsCreating(true);
    try {
      const newUser = await createUser(token, {
        email,
        full_name: fullName,
        password,
      });
      setUsers((prev) => [newUser, ...prev]);
      toast.success(`Account created for ${newUser.email}`);
      setEmail("");
      setFullName("");
      setPassword("");
      setShowCreateForm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create user.");
    } finally {
      setIsCreating(false);
    }
  }

  // If not admin, the section won't show (handled via loadError gracefully)
  if (loadError === "Admin access required.") return null;

  return (
    <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-purple-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            User Management
          </h2>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-1.5 rounded-md bg-gradient-to-r from-purple-500 to-pink-500 px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Add User
        </button>
      </div>

      {loadError && loadError !== "Admin access required." && (
        <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {loadError}
        </div>
      )}

      {/* Create user form */}
      {showCreateForm && (
        <form
          onSubmit={handleCreateUser}
          className="mb-6 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-gray-700 dark:text-gray-300 text-xs">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-gray-700 dark:text-gray-300 text-xs">Full Name</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-gray-700 dark:text-gray-300 text-xs">Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Min. 8 characters"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isCreating}
              className="rounded-md bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isCreating ? "Creating…" : "Create Account"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Users list */}
      <div className="overflow-x-auto">
        {isLoadingUsers ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
              <th className="pb-3 font-medium">User</th>
              <th className="pb-3 font-medium">Email</th>
              <th className="pb-3 font-medium">Status</th>
              <th className="pb-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                className="border-b border-gray-100 dark:border-gray-700/50"
              >
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-xs font-semibold text-white">
                      {u.full_name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-gray-900 dark:text-gray-200">
                      {u.full_name}
                      {u.id === currentUserId && (
                        <span className="ml-1.5 text-xs text-purple-400">(you)</span>
                      )}
                    </span>
                  </div>
                </td>
                <td className="py-3 text-gray-600 dark:text-gray-400">
                  {u.email}
                </td>
                <td className="py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.is_active
                        ? "bg-green-500/10 text-green-400"
                        : "bg-red-500/10 text-red-400"
                    }`}
                  >
                    {u.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="py-3 text-gray-500 dark:text-gray-400">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {users.length === 0 && !loadError && (
              <tr>
                <td
                  colSpan={4}
                  className="py-8 text-center text-gray-400"
                >
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        )}
      </div>
    </Card>
  );
}
