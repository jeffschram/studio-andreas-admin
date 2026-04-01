import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface AdditionalEntry {
  date: string;
  type: string;
  hours: number;
  notes: string;
}

// Types are now per-instructor, sourced from submission.availableRates

const CATEGORY_COLORS: Record<string, string> = {
  Class: "bg-blue-100 text-blue-800",
  Private: "bg-purple-100 text-purple-800",
  Workshop: "bg-amber-100 text-amber-800",
  "Open Studio": "bg-green-100 text-green-800",
  "Birthday Party": "bg-pink-100 text-pink-800",
  Membership: "bg-slate-100 text-slate-800",
  "Tech Hours": "bg-orange-100 text-orange-800",
};

function formatDate(isoString: string) {
  return new Date(isoString).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SubmitForm({ token }: { token: string }) {
  const data = useQuery(api.submissions.getByToken, { token });
  const submitMutation = useMutation(api.submissions.submit);

  const [confirmations, setConfirmations] = useState<Record<string, boolean>>(
    {}
  );
  const [additionalEntries, setAdditionalEntries] = useState<
    AdditionalEntry[]
  >([]);
  const [instructorNotes, setInstructorNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Initialize confirmations from session data (all true by default)
  if (data?.sessions && !initialized) {
    const initial: Record<string, boolean> = {};
    data.sessions.forEach((s) => {
      initial[s._id] = s.confirmedByInstructor;
    });
    setConfirmations(initial);
    setInitialized(true);
  }

  if (data === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Link not found</CardTitle>
            <CardDescription>
              This link is invalid or has expired. Please contact the studio
              admin.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { submission, instructor, payPeriod, sessions } = data;
  const availableRates = submission.availableRates ?? [];
  const availableTypes = availableRates.map((r) => r.label);

  if (submission.status === "submitted" || submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-green-700">
              ✓ Submission received
            </CardTitle>
            <CardDescription>
              Thanks {instructor?.name?.split(" ")[0]}! Your hours for{" "}
              {payPeriod?.number ? `Pay Period ${payPeriod.number}` : "this period"} have been
              submitted. The admin will review and finalize payroll.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const addEntry = () => {
    setAdditionalEntries([
      ...additionalEntries,
      { date: "", type: availableTypes[0] ?? "", hours: 0, notes: "" },
    ]);
  };

  const removeEntry = (index: number) => {
    setAdditionalEntries(additionalEntries.filter((_, i) => i !== index));
  };

  const updateEntry = (
    index: number,
    field: keyof AdditionalEntry,
    value: string | number
  ) => {
    const updated = [...additionalEntries];
    updated[index] = { ...updated[index], [field]: value };
    setAdditionalEntries(updated);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await submitMutation({
        token,
        sessionConfirmations: sessions.map((s) => ({
          sessionId: s._id as Id<"sessions">,
          confirmed: confirmations[s._id] ?? true,
        })),
        additionalEntries: additionalEntries.filter(
          (e) => e.date && e.hours > 0
        ),
        instructorNotes: instructorNotes || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      alert("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const uncheckedCount = sessions.filter(
    (s) => !confirmations[s._id]
  ).length;

  return (
    <div className="min-h-screen bg-muted/30 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Studio Andreas — Payroll Confirmation
          </h1>
          <p className="text-muted-foreground mt-1">
            {instructor?.name} &middot;{" "}
            {payPeriod
              ? `Pay Period ${payPeriod.number}: ${payPeriod.startDate} – ${payPeriod.endDate}`
              : ""}
          </p>
        </div>

        {/* Section 1: Scheduled appointments */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scheduled appointments</CardTitle>
            <CardDescription>
              All sessions from your Acuity calendar for this pay period are
              pre-checked. Uncheck anything you did <strong>not</strong> work.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sessions.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No scheduled sessions found for this period.
              </p>
            )}
            {sessions.map((session) => (
              <div
                key={session._id}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                  confirmations[session._id]
                    ? "bg-background border-border"
                    : "bg-muted/50 border-muted opacity-60"
                }`}
              >
                <Checkbox
                  id={session._id}
                  checked={confirmations[session._id] ?? true}
                  onCheckedChange={(checked) =>
                    setConfirmations((prev) => ({
                      ...prev,
                      [session._id]: !!checked,
                    }))
                  }
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <Label
                    htmlFor={session._id}
                    className="font-medium cursor-pointer leading-snug"
                  >
                    {session.info}
                  </Label>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {formatDate(session.datetime)}
                    {session.quantity > 1 && (
                      <span> &middot; {session.quantity} students</span>
                    )}
                  </p>
                </div>
                <Badge
                  className={`text-xs shrink-0 ${
                    CATEGORY_COLORS[session.category] ?? ""
                  }`}
                  variant="outline"
                >
                  {session.category}
                </Badge>
              </div>
            ))}

            {uncheckedCount > 0 && (
              <p className="text-sm text-amber-600 font-medium pt-1">
                {uncheckedCount} session{uncheckedCount !== 1 ? "s" : ""}{" "}
                unchecked — the admin will be notified to review.
              </p>
            )}
          </CardContent>
        </Card>

        <Separator />

        {/* Section 2: Additional hours — only shown if instructor has applicable rate types */}
        {availableTypes.length > 0 && <Card>
          <CardHeader>
            <CardTitle className="text-base">Additional hours</CardTitle>
            <CardDescription>
              Add any hours worked that aren't in Acuity — tech hours, prep
              time, meetings, etc.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {additionalEntries.map((entry, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_1fr_80px_auto] gap-2 items-start"
              >
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Date</Label>
                  <input
                    type="date"
                    value={entry.date}
                    onChange={(e) => updateEntry(i, "date", e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Type</Label>
                  <select
                    value={entry.type}
                    onChange={(e) => updateEntry(i, "type", e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  >
                    {availableTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Hours
                  </Label>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={entry.hours || ""}
                    onChange={(e) =>
                      updateEntry(i, "hours", parseFloat(e.target.value) || 0)
                    }
                    placeholder="0"
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  />
                </div>
                <div className="pt-6">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeEntry(i)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    ✕
                  </Button>
                </div>
                <div className="col-span-4 space-y-1">
                  <input
                    type="text"
                    value={entry.notes}
                    onChange={(e) => updateEntry(i, "notes", e.target.value)}
                    placeholder="Brief description (optional)"
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  />
                </div>
              </div>
            ))}

            <Button variant="outline" size="sm" onClick={addEntry}>
              + Add hours
            </Button>
          </CardContent>
        </Card>}

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes for admin</CardTitle>
            <CardDescription>
              Anything the admin should know about this pay period.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={instructorNotes}
              onChange={(e) => setInstructorNotes(e.target.value)}
              placeholder="Optional..."
              rows={3}
            />
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end pb-10">
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={submitting}
            className="min-w-36"
          >
            {submitting ? "Submitting..." : "Submit hours"}
          </Button>
        </div>
      </div>
    </div>
  );
}
