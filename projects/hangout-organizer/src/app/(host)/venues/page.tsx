import { createClient } from "@/lib/supabase/server";
import { deleteVenue, saveVenue } from "@/lib/actions";
import {
  Button,
  Card,
  Empty,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import { CURRENCY } from "@/lib/slots";
import type { Sport, Venue } from "@/lib/types";

export const dynamic = "force-dynamic";

function money(value: number | null, currency: string) {
  if (value == null) return null;
  return `${currency === "MYR" ? "RM" : currency} ${Number(value).toFixed(2)}`;
}

export default async function VenuesPage() {
  const supabase = await createClient();
  const [{ data: venueData }, { data: sportData }] = await Promise.all([
    supabase.from("venues").select("*").order("name"),
    supabase.from("sports").select("*").order("name"),
  ]);

  const venues = (venueData ?? []) as Venue[];
  const sports = (sportData ?? []) as Sport[];
  const sportName = new Map(sports.map((s) => [s.id, s.name]));

  return (
    <>
      <PageHeader
        title="Venues"
        subtitle="Where to book, on which platform, at what price — so you stop re-deriving it every week."
      />

      <Card className="mb-6">
        <h2 className="mb-3 font-medium">Add a venue</h2>
        <form action={saveVenue} className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input name="name" required placeholder="e.g. Sunway Badminton Hall" />
          </Field>
          <Field label="Sport">
            <Select name="sport_id" defaultValue="">
              <option value="">Any</option>
              {sports.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Booking platform">
            <Input name="platform_name" placeholder="e.g. Courtsite, walk-in, WhatsApp" />
          </Field>
          <Field label="Booking URL">
            <Input name="booking_url" type="url" placeholder="https://…" />
          </Field>
          <Field label={`Price per hour (${CURRENCY})`}>
            <Input name="price_per_hour" type="number" step="0.01" min="0" />
          </Field>
          <Field label={`Peak price per hour (${CURRENCY})`}>
            <Input name="peak_price_per_hour" type="number" step="0.01" min="0" />
          </Field>
          <Field label="Booking opens (days ahead)" hint="How far in advance the platform lets you book.">
            <Input name="booking_opens_days_ahead" type="number" min="0" />
          </Field>
          <Field label="Address">
            <Input name="address" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes" hint="Court numbers, parking, who to ask for, deposit rules…">
              <Textarea name="notes" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit">Save venue</Button>
          </div>
        </form>
      </Card>

      {venues.length === 0 ? (
        <Empty>No venues saved yet.</Empty>
      ) : (
        <div className="space-y-3">
          {venues.map((venue) => (
            <Card key={venue.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium">{venue.name}</h3>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {[
                      venue.sport_id ? sportName.get(venue.sport_id) : null,
                      venue.platform_name,
                      money(venue.price_per_hour, venue.currency)
                        ? `${money(venue.price_per_hour, venue.currency)}/hr`
                        : null,
                      money(venue.peak_price_per_hour, venue.currency)
                        ? `peak ${money(venue.peak_price_per_hour, venue.currency)}/hr`
                        : null,
                      venue.booking_opens_days_ahead != null
                        ? `opens ${venue.booking_opens_days_ahead}d ahead`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No details yet"}
                  </p>
                  {venue.address && <p className="mt-1 text-sm text-slate-500">{venue.address}</p>}
                  {venue.notes && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{venue.notes}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  {venue.booking_url && (
                    <a
                      href={venue.booking_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
                    >
                      Open booking
                    </a>
                  )}
                  <form action={deleteVenue}>
                    <input type="hidden" name="id" value={venue.id} />
                    <Button type="submit" variant="danger">
                      Delete
                    </Button>
                  </form>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
