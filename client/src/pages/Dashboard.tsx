import { ReactNode, useEffect, useMemo, useState } from "react";
import { LineChart } from "@mui/x-charts/LineChart";
import { PieChart } from "@mui/x-charts/PieChart";
import {
  FaArrowTrendUp,
  FaBug,
  FaFilm,
  FaGlobe,
  FaLayerGroup,
  FaUsers,
} from "react-icons/fa6";
import apiClient from "../api/apiClient";
import VerticalNavbar from "../component/VerticalNavbar";
import "./Dashboard.css";

interface AnalyticsResponse {
  meta: {
    rangeDays: number;
    generatedAt: string;
    trackingSince: string | null;
    geographySource: string;
  };
  overview: {
    totalUsers: number;
    newUsers: number;
    previousNewUsers: number;
    userGrowthRate: number;
    activeUsers: number;
    dau: number;
    wau: number;
    mau: number;
    totalGroups: number;
    moviesWatched: number;
    totalPolls: number;
    openBugReports: number;
  };
  trend: Array<{ date: string; activeUsers: number; newUsers: number; events: number }>;
  features: Array<{
    feature: string;
    label: string;
    uniqueUsers: number;
    uses: number;
    adoptionRate: number;
    change: number;
  }>;
  countries: Array<{ country: string; users: number; events: number }>;
  devices: Array<{ device: string; users: number; events: number }>;
  funnel: Array<{ key: string; label: string; users: number; conversionRate: number }>;
}

const RANGE_OPTIONS = [7, 30, 90, 365];
const CHART_COLORS = ["#d3ac6c", "#f3eee4", "#5f8b6c", "#8f8573"];

const number = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const fullNumber = new Intl.NumberFormat("en");

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00Z`));

const Metric = ({ label, value, detail, icon }: { label: string; value: number; detail: string; icon: ReactNode }) => (
  <article className="analytics-metric">
    <div className="analytics-metric__icon" aria-hidden="true">{icon}</div>
    <p>{label}</p>
    <strong>{number.format(value)}</strong>
    <span>{detail}</span>
  </article>
);

const EmptySignal = ({ children }: { children: ReactNode }) => (
  <div className="analytics-empty">
    <span aria-hidden="true">◌</span>
    <p>{children}</p>
  </div>
);

export default function Dashboard() {
  const [rangeDays, setRangeDays] = useState(30);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await apiClient.get<AnalyticsResponse>("/api/analytics/admin/overview", {
          params: { days: rangeDays },
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        if (!cancelled) setData(response.data);
      } catch (requestError: any) {
        if (!cancelled) {
          setError(requestError?.response?.status === 403
            ? "This report is restricted to the Movie Tracker owner."
            : "The analytics report could not be loaded.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [rangeDays]);

  const chartDates = useMemo(() => data?.trend.map((point) => formatDate(point.date)) || [], [data?.trend]);
  const maxCountryUsers = Math.max(...(data?.countries.map((country) => country.users) || [1]), 1);
  const topFeatures = data?.features.slice(0, 8) || [];
  const maxFeatureUsers = Math.max(...topFeatures.map((feature) => feature.uniqueUsers), 1);

  return (
    <div className="analytics-page">
      <VerticalNavbar />
      <main className="analytics-report">
        <header className="analytics-header">
          <div>
            <p className="analytics-kicker">Owner report · MT–01</p>
            <h1>Audience & product intelligence</h1>
            <p className="analytics-intro">A live reading of who is arriving, what brings them back, and where the movie-night journey slows down.</p>
          </div>
          <label className="analytics-range">
            <span>Reporting window</span>
            <select value={rangeDays} onChange={(event) => setRangeDays(Number(event.target.value))}>
              {RANGE_OPTIONS.map((days) => <option key={days} value={days}>Last {days} days</option>)}
            </select>
          </label>
        </header>

        {loading ? <div className="analytics-loading" role="status">Compiling the audience report…</div> : null}
        {!loading && error ? <div className="analytics-error" role="alert">{error}</div> : null}

        {!loading && data ? (
          <>
            <section className="analytics-metrics" aria-label="Product overview">
              <Metric label="Registered audience" value={data.overview.totalUsers} detail={`${fullNumber.format(data.overview.newUsers)} joined in this period`} icon={<FaUsers />} />
              <Metric label="Active audience" value={data.overview.activeUsers} detail={`${fullNumber.format(data.overview.mau)} monthly active`} icon={<FaArrowTrendUp />} />
              <Metric label="Movie groups" value={data.overview.totalGroups} detail={`${fullNumber.format(data.overview.totalPolls)} polls created`} icon={<FaLayerGroup />} />
              <Metric label="Films logged" value={data.overview.moviesWatched} detail="Across every group" icon={<FaFilm />} />
              <Metric label="Open reports" value={data.overview.openBugReports} detail="Open or in progress" icon={<FaBug />} />
            </section>

            <section className="analytics-band" aria-label="User activity summary">
              <div><span>DAU</span><strong>{fullNumber.format(data.overview.dau)}</strong><small>today</small></div>
              <div><span>WAU</span><strong>{fullNumber.format(data.overview.wau)}</strong><small>last 7 days</small></div>
              <div><span>MAU</span><strong>{fullNumber.format(data.overview.mau)}</strong><small>last 30 days</small></div>
              <div className="analytics-band__growth">
                <span>New-user growth</span>
                <strong>{data.overview.userGrowthRate > 0 ? "+" : ""}{data.overview.userGrowthRate}%</strong>
                <small>versus previous period</small>
              </div>
            </section>

            <section className="analytics-grid analytics-grid--primary">
              <article className="analytics-panel analytics-panel--trend">
                <div className="analytics-panel__heading">
                  <div><h2>Audience trajectory</h2></div>
                  <p>Active and newly registered users per day</p>
                </div>
                <LineChart
                  height={330}
                  xAxis={[{ scaleType: "point", data: chartDates, tickLabelStyle: { fill: "#a49d8f", fontSize: 10 } }]}
                  yAxis={[{ tickLabelStyle: { fill: "#a49d8f", fontSize: 10 } }]}
                  series={[
                    { data: data.trend.map((point) => point.activeUsers), label: "Active users", color: CHART_COLORS[0], showMark: false },
                    { data: data.trend.map((point) => point.newUsers), label: "New users", color: CHART_COLORS[1], showMark: false },
                  ]}
                  grid={{ horizontal: true }}
                  margin={{ left: 8, right: 20, top: 30, bottom: 25 }}
                />
              </article>

              <article className="analytics-panel analytics-panel--pulse">
                <div className="analytics-panel__heading">
                  <div><h2>Device pulse</h2></div>
                  <p>Unique audience by device class</p>
                </div>
                {data.devices.length ? (
                  <>
                    <PieChart
                      height={230}
                      series={[{
                        innerRadius: 58,
                        outerRadius: 92,
                        paddingAngle: 2,
                        data: data.devices.map((item, index) => ({ id: item.device, value: item.users, label: item.device, color: CHART_COLORS[index % CHART_COLORS.length] })),
                      }]}
                      margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
                      hideLegend
                    />
                    <div className="analytics-legend">
                      {data.devices.map((item, index) => (
                        <div key={item.device}><i style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} /><span>{item.device}</span><strong>{item.users}</strong></div>
                      ))}
                    </div>
                  </>
                ) : <EmptySignal>Device activity will appear after members use the app.</EmptySignal>}
              </article>
            </section>

            <section className="analytics-grid analytics-grid--features">
              <article className="analytics-panel analytics-panel--features">
                <div className="analytics-panel__heading">
                  <div><h2>Feature signal</h2></div>
                  <p>Ranked by unique users, not noisy click totals</p>
                </div>
                {topFeatures.length ? (
                  <div className="feature-ranking" aria-label="Feature ranking by unique users">
                    {topFeatures.map((feature, index) => (
                      <div className="feature-rank" key={feature.feature}>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <strong>{feature.label}</strong>
                        <div aria-hidden="true"><i style={{ width: `${(feature.uniqueUsers / maxFeatureUsers) * 100}%` }} /></div>
                        <b>{feature.uniqueUsers}</b>
                      </div>
                    ))}
                  </div>
                ) : <EmptySignal>Feature rankings begin with the next authenticated visit.</EmptySignal>}
              </article>

              <article className="analytics-panel analytics-panel--table">
                <div className="analytics-panel__heading">
                  <div><h2>Adoption ledger</h2></div>
                  <p>Reach and frequency for each product surface</p>
                </div>
                {topFeatures.length ? (
                  <div className="analytics-table-wrap">
                    <table>
                      <thead><tr><th>Feature</th><th>Users</th><th>Uses</th><th>Adoption</th></tr></thead>
                      <tbody>{topFeatures.map((feature) => (
                        <tr key={feature.feature}>
                          <td>{feature.label}</td>
                          <td>{feature.uniqueUsers}</td>
                          <td>{feature.uses}</td>
                          <td><strong>{feature.adoptionRate}%</strong></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : <EmptySignal>No feature events have been recorded in this period.</EmptySignal>}
              </article>
            </section>

            <section className="analytics-grid analytics-grid--audience">
              <article className="analytics-panel analytics-panel--atlas">
                <div className="analytics-panel__heading">
                  <div><h2>Audience atlas</h2></div>
                  <p>Approximate country from privacy-conscious request headers</p>
                </div>
                {data.countries.length ? (
                  <div className="country-list">
                    {data.countries.map((country, index) => (
                      <div className="country-row" key={`${country.country}-${index}`}>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <strong><FaGlobe aria-hidden="true" /> {country.country}</strong>
                        <div><i style={{ width: `${Math.max((country.users / maxCountryUsers) * 100, 4)}%` }} /></div>
                        <b>{country.users}</b>
                      </div>
                    ))}
                  </div>
                ) : <EmptySignal>Geography will appear when hosting headers provide a country code.</EmptySignal>}
              </article>

              <article className="analytics-panel analytics-panel--funnel">
                <div className="analytics-panel__heading">
                  <div><h2>Movie-night funnel</h2></div>
                  <p>From registration to a film being watched</p>
                </div>
                <div className="funnel-list">
                  {data.funnel.map((step, index) => (
                    <div className="funnel-step" key={step.key} style={{ width: `${Math.max(100 - index * 9, 64)}%` }}>
                      <span>{step.label}</span><strong>{step.users}</strong><small>{step.conversionRate}%</small>
                    </div>
                  ))}
                </div>
                <p className="analytics-footnote">Steps are independent unique-user signals for this reporting window; they are directional until enough events accumulate.</p>
              </article>
            </section>

            <footer className="analytics-footer">
              <span>Generated {new Date(data.meta.generatedAt).toLocaleString()}</span>
              <span>{data.meta.trackingSince ? `Behavior tracking since ${new Date(data.meta.trackingSince).toLocaleDateString()}` : "Behavior tracking starts with the next visit"}</span>
            </footer>
          </>
        ) : null}
      </main>
    </div>
  );
}
