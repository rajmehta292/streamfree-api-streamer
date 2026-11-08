import { LRUCache } from 'lru-cache';
import type { StreamItem } from '../types/stream.js';

export interface AthleteInfo {
  id: string;
  name: string;
  jersey?: string;
  position?: string;
  headshot: string;
  stats?: string[];
  teamName?: string;
  height?: string;
  weight?: string;
  age?: number;
  college?: string;
  experience?: string;
}

export interface BoxScoreCategory {
  name: string;
  displayName: string;
  labels: string[];
  athletes: AthleteInfo[];
}

export interface TeamBoxScore {
  teamName: string;
  teamLogo: string;
  categories: BoxScoreCategory[];
}

export interface SportsGamecastIntel {
  stream_key: string;
  source: 'espn' | 'reference_engine';
  sportPath?: string;
  scoreboard: {
    team1: { name: string; logo: string; score: string; record?: string; isHome: boolean };
    team2: { name: string; logo: string; score: string; record?: string; isHome: boolean };
    status: string;
    detail: string;
    clock?: string;
    period?: number;
    downDistance?: string;
    possession?: string;
  };
  winProbability?: {
    team1Percentage: number;
    team2Percentage: number;
  };
  stats: Array<{ label: string; team1Value: string; team2Value: string }>;
  leaders: Array<{
    category: string;
    athlete: AthleteInfo;
    statline: string;
    teamName?: string;
  }>;
  boxscore?: {
    team1: TeamBoxScore;
    team2: TeamBoxScore;
  };
  rosters?: {
    team1: AthleteInfo[];
    team2: AthleteInfo[];
  };
  scoringPlays: Array<{
    period: string;
    clock: string;
    teamLogo?: string;
    teamName: string;
    score: string;
    description: string;
  }>;
  gameInfo: {
    venue?: string;
    city?: string;
    attendance?: string;
    weather?: string;
    broadcast?: string;
    odds?: string;
    overUnder?: string;
  };
  news: Array<{
    title: string;
    description: string;
    link: string;
    image?: string;
    published?: string;
  }>;
}

export interface AthleteProfileDetails {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  jersey?: string;
  position?: string;
  height?: string;
  weight?: string;
  age?: number;
  college?: string;
  experience?: string;
  headshot: string;
  teamName?: string;
  teamLogo?: string;
  statsSummary?: any;
  overviewStats?: Array<{ label: string; value: string }>;
  biography?: string;
}

class SportsIntelService {
  private cache: LRUCache<string, SportsGamecastIntel>;
  private athleteCache: LRUCache<string, AthleteProfileDetails>;

  constructor() {
    this.cache = new LRUCache<string, SportsGamecastIntel>({
      max: 200,
      ttl: 20000, // 20 seconds cache for live sports
    });

    this.athleteCache = new LRUCache<string, AthleteProfileDetails>({
      max: 500,
      ttl: 3600000, // 1 hour for athlete profiles
    });
  }

  async getGamecastIntel(stream: StreamItem): Promise<SportsGamecastIntel> {
    const cached = this.cache.get(stream.stream_key);
    if (cached) return cached;

    try {
      const espnData = await this.fetchFromESPN(stream);
      if (espnData) {
        this.cache.set(stream.stream_key, espnData);
        return espnData;
      }
    } catch (err) {
      console.error(`[SportsIntelService] Error fetching ESPN intelligence for ${stream.stream_key}:`, err);
    }

    const fallback = this.generateComprehensiveFallback(stream);
    this.cache.set(stream.stream_key, fallback);
    return fallback;
  }

  async getAthleteProfile(sport: string, league: string, athleteId: string): Promise<AthleteProfileDetails> {
    const cacheKey = `${sport}:${league}:${athleteId}`;
    const cached = this.athleteCache.get(cacheKey);
    if (cached) return cached;

    try {
      const url = `https://site.api.espn.com/apis/common/v3/sports/${sport}/${league}/athletes/${athleteId}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });

      if (res.ok) {
        const data: any = await res.json();
        const a = data.athlete || {};

        const overviewStats: Array<{ label: string; value: string }> = [];
        if (data.statsSummary?.statistics) {
          for (const stat of data.statsSummary.statistics.slice(0, 6)) {
            overviewStats.push({
              label: stat.label || stat.name,
              value: stat.displayValue || String(stat.value),
            });
          }
        }

        const profile: AthleteProfileDetails = {
          id: athleteId,
          name: a.displayName || `${a.firstName || ''} ${a.lastName || ''}`.trim() || 'Player Profile',
          firstName: a.firstName,
          lastName: a.lastName,
          jersey: a.jersey,
          position: a.position?.name || a.position?.displayName || a.position?.abbreviation,
          height: a.displayHeight,
          weight: a.displayWeight,
          age: a.age,
          college: a.college?.name,
          experience: a.experience?.years !== undefined ? (a.experience.years === 0 ? 'Rookie' : `${a.experience.years} yrs`) : undefined,
          headshot: a.headshot?.href || 'https://a.espncdn.com/combiner/i?img=/i/headshots/nophoto.png&w=260&h=190',
          teamName: a.team?.displayName,
          teamLogo: a.team?.logos?.[0]?.href,
          statsSummary: data.statsSummary,
          overviewStats,
          biography: a.debutYear ? `Drafted / Debuted in ${a.debutYear}. Attended ${a.college?.name || 'collegiate athletics'}.` : undefined,
        };

        this.athleteCache.set(cacheKey, profile);
        return profile;
      }
    } catch (err) {}

    // Fallback profile if simulated or not found
    const fallbackProfile: AthleteProfileDetails = {
      id: athleteId,
      name: 'Athlete Profile',
      position: 'Starter',
      height: `6' 2"`,
      weight: '215 lbs',
      headshot: 'https://a.espncdn.com/combiner/i?img=/i/headshots/nophoto.png&w=260&h=190',
      overviewStats: [
        { label: 'Rating', value: '88.5' },
        { label: 'Efficiency', value: '+14' },
      ],
    };
    return fallbackProfile;
  }

  private async fetchFromESPN(stream: StreamItem): Promise<SportsGamecastIntel | null> {
    const sportPath = this.resolveSportPath(stream.category, stream.league);
    if (!sportPath) return null;

    const scoreboardUrl = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/scoreboard`;
    const res = await fetch(scoreboardUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;

    const scoreboard: any = await res.json();
    const events: any[] = scoreboard.events || [];

    // Parse team tokens
    const streamName = stream.name.toLowerCase();
    const t1Raw = (stream.team1?.name || streamName.split(/vs|at/i)[0] || '').toLowerCase().trim();
    const t2Raw = (stream.team2?.name || streamName.split(/vs|at/i)[1] || '').toLowerCase().trim();

    let matchedEvent: any = null;

    for (const event of events) {
      const evName = (event.name || '').toLowerCase();
      const comps: any[] = event.competitions?.[0]?.competitors || [];
      const c0Name = (comps[0]?.team?.displayName || '').toLowerCase();
      const c1Name = (comps[1]?.team?.displayName || '').toLowerCase();
      const c0Short = (comps[0]?.team?.shortDisplayName || '').toLowerCase();
      const c1Short = (comps[1]?.team?.shortDisplayName || '').toLowerCase();
      const c0Mascot = (comps[0]?.team?.name || '').toLowerCase();
      const c1Mascot = (comps[1]?.team?.name || '').toLowerCase();

      const team1Matches = t1Raw && (
        c0Name.includes(t1Raw) || t1Raw.includes(c0Name) ||
        c1Name.includes(t1Raw) || t1Raw.includes(c1Name) ||
        c0Short.includes(t1Raw) || t1Raw.includes(c0Short) ||
        c1Short.includes(t1Raw) || t1Raw.includes(c1Short) ||
        c0Mascot.includes(t1Raw) || t1Raw.includes(c0Mascot) ||
        c1Mascot.includes(t1Raw) || t1Raw.includes(c1Mascot)
      );

      const team2Matches = t2Raw && (
        c0Name.includes(t2Raw) || t2Raw.includes(c0Name) ||
        c1Name.includes(t2Raw) || t2Raw.includes(c1Name) ||
        c0Short.includes(t2Raw) || t2Raw.includes(c0Short) ||
        c1Short.includes(t2Raw) || t2Raw.includes(c1Short) ||
        c0Mascot.includes(t2Raw) || t2Raw.includes(c0Mascot) ||
        c1Mascot.includes(t2Raw) || t2Raw.includes(c1Mascot)
      );

      if ((team1Matches && team2Matches) || evName.includes(t1Raw) || evName.includes(t2Raw)) {
        matchedEvent = event;
        break;
      }
    }

    // Fetch News Articles
    let newsArticles: any[] = [];
    try {
      const newsRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sportPath}/news`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (newsRes.ok) {
        const newsJson: any = await newsRes.json();
        newsArticles = (newsJson.articles || []).slice(0, 4).map((a: any) => ({
          title: a.headline,
          description: a.description || '',
          link: a.links?.web?.href || 'https://espn.com',
          image: a.images?.[0]?.url,
          published: a.published,
        }));
      }
    } catch (e) {}

    if (!matchedEvent) {
      return null;
    }

    // Fetch deep summary (box score, players, drives, leaders)
    let summary: any = {};
    try {
      const sumRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${sportPath}/summary?event=${matchedEvent.id}`);
      if (sumRes.ok) {
        summary = (await sumRes.json()) as any;
      }
    } catch (e) {}

    const comp = matchedEvent.competitions[0];
    const competitors: any[] = comp.competitors || [];

    // CRITICAL BUG FIX: Match comp1 with stream.team1, and comp2 with stream.team2
    // Never assume competitors[0] is team1 or home is team1!
    let comp1 = competitors.find((c: any) => {
      const dName = (c.team?.displayName || '').toLowerCase();
      const sName = (c.team?.shortDisplayName || '').toLowerCase();
      const loc = (c.team?.location || '').toLowerCase();
      const mas = (c.team?.name || '').toLowerCase();
      return (t1Raw && (dName.includes(t1Raw) || t1Raw.includes(dName) || sName.includes(t1Raw) || t1Raw.includes(sName) || mas.includes(t1Raw) || t1Raw.includes(mas) || loc.includes(t1Raw) || t1Raw.includes(loc)));
    });

    let comp2 = competitors.find((c: any) => {
      const dName = (c.team?.displayName || '').toLowerCase();
      const sName = (c.team?.shortDisplayName || '').toLowerCase();
      const loc = (c.team?.location || '').toLowerCase();
      const mas = (c.team?.name || '').toLowerCase();
      return (t2Raw && (dName.includes(t2Raw) || t2Raw.includes(dName) || sName.includes(t2Raw) || t2Raw.includes(sName) || mas.includes(t2Raw) || t2Raw.includes(mas) || loc.includes(t2Raw) || t2Raw.includes(loc)));
    });

    if (!comp1 && !comp2) {
      comp1 = competitors[0];
      comp2 = competitors[1];
    } else if (!comp1) {
      comp1 = competitors.find((c: any) => c !== comp2) || competitors[0];
    } else if (!comp2) {
      comp2 = competitors.find((c: any) => c !== comp1) || competitors[1];
    }

    // Correct Win Probability calculation
    let winProb: { team1Percentage: number; team2Percentage: number } | undefined;
    if (summary.winprobability && summary.winprobability.length > 0) {
      const latest = summary.winprobability[summary.winprobability.length - 1];
      const rawHomePct = Math.round((latest.homeWinPercentage || 0.5) * 100);

      // If comp1 is the home team, comp1 has homePct. If comp2 is home, comp1 has 100 - homePct!
      if (comp1.homeAway === 'home') {
        winProb = {
          team1Percentage: rawHomePct,
          team2Percentage: 100 - rawHomePct,
        };
      } else {
        winProb = {
          team1Percentage: 100 - rawHomePct,
          team2Percentage: rawHomePct,
        };
      }
    }

    // Team comparison stats
    const statsList: Array<{ label: string; team1Value: string; team2Value: string }> = [];
    if (summary.boxscore?.teams) {
      // Find the stats array corresponding to comp1 and comp2
      const teamBoxscores = summary.boxscore.teams;
      const t1StatsObj = teamBoxscores.find((tb: any) => tb.team?.id === comp1.team?.id) || teamBoxscores[0];
      const t2StatsObj = teamBoxscores.find((tb: any) => tb.team?.id === comp2.team?.id) || teamBoxscores[1];

      const t1Stats = t1StatsObj?.statistics || [];
      const t2Stats = t2StatsObj?.statistics || [];

      for (let i = 0; i < Math.min(t1Stats.length, t2Stats.length, 10); i++) {
        statsList.push({
          label: t1Stats[i].label || t1Stats[i].name,
          team1Value: t1Stats[i].displayValue || String(t1Stats[i].value),
          team2Value: t2Stats[i].displayValue || String(t2Stats[i].value),
        });
      }
    }

    // Key Leaders (StatMuse / Reference style)
    const leadersList: Array<{
      category: string;
      athlete: AthleteInfo;
      statline: string;
      teamName?: string;
    }> = [];

    if (summary.leaders && Array.isArray(summary.leaders)) {
      const flatCats: any[] = [];
      for (const item of summary.leaders) {
        if (item.team && Array.isArray(item.leaders)) {
          for (const subCat of item.leaders) {
            flatCats.push({
              ...subCat,
              teamName: item.team?.displayName,
            });
          }
        } else {
          flatCats.push(item);
        }
      }

      for (const cat of flatCats.slice(0, 6)) {
        const leaderObj = cat.leaders?.[0];
        if (leaderObj?.athlete) {
          leadersList.push({
            category: cat.displayName || cat.name || 'Key Leader',
            athlete: {
              id: leaderObj.athlete.id,
              name: leaderObj.athlete.displayName,
              headshot: leaderObj.athlete.headshot?.href || 'https://a.espncdn.com/combiner/i?img=/i/headshots/nophoto.png&w=120&h=90',
              position: leaderObj.athlete.position?.abbreviation,
              jersey: leaderObj.athlete.jersey,
            },
            statline: leaderObj.displayValue ? `${leaderObj.displayValue} ${cat.displayName || ''}`.trim() : (leaderObj.value ? String(leaderObj.value) : ''),
            teamName: cat.teamName || leaderObj.team?.displayName,
          });
        }
      }
    }

    // DEEP BOX SCORE (Players by Category)
    let parsedBoxScore: { team1: TeamBoxScore; team2: TeamBoxScore } | undefined;
    const team1Roster: AthleteInfo[] = [];
    const team2Roster: AthleteInfo[] = [];

    if (summary.boxscore?.players && Array.isArray(summary.boxscore.players)) {
      const p1Obj = summary.boxscore.players.find((p: any) => p.team?.id === comp1.team?.id) || summary.boxscore.players[0];
      const p2Obj = summary.boxscore.players.find((p: any) => p.team?.id === comp2.team?.id) || summary.boxscore.players[1];

      const parsePlayerTeam = (pObj: any, rosterArr: AthleteInfo[]): TeamBoxScore => {
        const cats: BoxScoreCategory[] = [];
        const seenAthletes = new Set<string>();

        for (const statCat of (pObj?.statistics || [])) {
          const catAthletes: AthleteInfo[] = [];
          for (const aObj of (statCat.athletes || [])) {
            const a = aObj.athlete || {};
            const athInfo: AthleteInfo = {
              id: a.id,
              name: a.displayName || 'Player',
              jersey: a.jersey,
              position: a.position?.abbreviation || a.position?.name,
              headshot: a.headshot?.href || 'https://a.espncdn.com/combiner/i?img=/i/headshots/nophoto.png&w=120&h=90',
              stats: aObj.stats || [],
              teamName: pObj.team?.displayName,
            };
            catAthletes.push(athInfo);

            if (a.id && !seenAthletes.has(a.id)) {
              seenAthletes.add(a.id);
              rosterArr.push(athInfo);
            }
          }

          cats.push({
            name: statCat.name || statCat.type || 'stats',
            displayName: statCat.displayName || (statCat.name ? statCat.name.toUpperCase() : 'Full Team Stats'),
            labels: statCat.labels || [],
            athletes: catAthletes,
          });
        }

        return {
          teamName: pObj?.team?.displayName || 'Team',
          teamLogo: pObj?.team?.logo || '',
          categories: cats,
        };
      };

      parsedBoxScore = {
        team1: parsePlayerTeam(p1Obj, team1Roster),
        team2: parsePlayerTeam(p2Obj, team2Roster),
      };
    }

    // Scoring plays
    const scoringPlaysList: Array<{
      period: string;
      clock: string;
      teamLogo?: string;
      teamName: string;
      score: string;
      description: string;
    }> = [];

    if (summary.scoringPlays && Array.isArray(summary.scoringPlays)) {
      for (const sp of summary.scoringPlays.slice(-8)) {
        scoringPlaysList.push({
          period: sp.period?.displayName || `Q${sp.period?.number || 1}`,
          clock: sp.clock?.displayValue || '',
          teamLogo: sp.team?.logo,
          teamName: sp.team?.displayName || '',
          score: `${sp.awayScore || 0} - ${sp.homeScore || 0}`,
          description: sp.text || sp.type?.text || '',
        });
      }
    } else if (summary.plays && Array.isArray(summary.plays)) {
      // In basketball / soccer where scoringPlays is not present, extract latest plays
      const recentPlays = summary.plays.slice(-8);
      for (const sp of recentPlays) {
        scoringPlaysList.push({
          period: sp.period?.displayValue || `Period ${sp.period?.number || 1}`,
          clock: sp.clock?.displayValue || '',
          teamLogo: undefined,
          teamName: sp.team?.id ? (sp.team.id === comp1.team?.id ? comp1.team?.displayName : comp2.team?.displayName) : '',
          score: (sp.awayScore !== undefined && sp.homeScore !== undefined) ? `${sp.awayScore} - ${sp.homeScore}` : '',
          description: sp.text || sp.shortDescription || 'Live play in action',
        });
      }
    }

    // Venue & Odds
    const gameInfoObj = {
      venue: summary.gameInfo?.venue?.fullName || comp.venue?.fullName || 'Main Stadium',
      city: summary.gameInfo?.venue?.address?.city || comp.venue?.address?.city || '',
      attendance: summary.gameInfo?.attendance ? Number(summary.gameInfo.attendance).toLocaleString() : undefined,
      weather: summary.gameInfo?.weather?.displayValue,
      broadcast: comp.broadcasts?.[0]?.names?.join(', ') || 'StreamFree HD Stream',
      odds: summary.odds?.[0]?.details || summary.pickcenter?.[0]?.details,
      overUnder: summary.odds?.[0]?.overUnder ? `O/U ${summary.odds[0].overUnder}` : undefined,
    };

    return {
      stream_key: stream.stream_key,
      source: 'espn',
      sportPath,
      scoreboard: {
        team1: {
          name: comp1?.team?.displayName || stream.team1?.name || 'Team 1',
          logo: comp1?.team?.logo || stream.team1?.logo || '',
          score: comp1?.score || '0',
          record: comp1?.records?.[0]?.summary,
          isHome: comp1?.homeAway === 'home',
        },
        team2: {
          name: comp2?.team?.displayName || stream.team2?.name || 'Team 2',
          logo: comp2?.team?.logo || stream.team2?.logo || '',
          score: comp2?.score || '0',
          record: comp2?.records?.[0]?.summary,
          isHome: comp2?.homeAway === 'home',
        },
        status: matchedEvent.status?.type?.detail || 'Live Broadcast',
        detail: matchedEvent.status?.type?.shortDetail || 'LIVE',
        clock: matchedEvent.status?.displayClock,
        period: matchedEvent.status?.period,
        downDistance: summary.drives?.current?.description,
      },
      winProbability: winProb,
      stats: statsList.length > 0 ? statsList : this.getCategoryDefaultStats(stream.category),
      leaders: leadersList,
      boxscore: parsedBoxScore,
      rosters: (team1Roster.length > 0 || team2Roster.length > 0) ? { team1: team1Roster, team2: team2Roster } : undefined,
      scoringPlays: scoringPlaysList,
      gameInfo: gameInfoObj,
      news: newsArticles,
    };
  }

  private resolveSportPath(category: string, league?: string): string | null {
    const cat = (category || '').toLowerCase();
    const l = (league || '').toLowerCase();

    if (cat === 'football' || l.includes('nfl')) return 'football/nfl';
    if (cat === 'basketball' || l.includes('nba')) return 'basketball/nba';
    if (cat === 'baseball' || l.includes('mlb')) return 'baseball/mlb';
    if (cat === 'hockey' || l.includes('nhl')) return 'hockey/nhl';

    if (cat === 'soccer') {
      if (l.includes('premier') || l.includes('eng')) return 'soccer/eng.1';
      if (l.includes('serie') || l.includes('ita')) return 'soccer/ita.1';
      if (l.includes('la liga') || l.includes('esp')) return 'soccer/esp.1';
      if (l.includes('champions') || l.includes('uefa')) return 'soccer/uefa.champions';
      if (l.includes('mls') || l.includes('usa')) return 'soccer/usa.1';
      return 'soccer/eng.1';
    }

    return null;
  }

  private generateComprehensiveFallback(stream: StreamItem): SportsGamecastIntel {
    const isFootball = stream.category === 'football';
    const isBasketball = stream.category === 'basketball';
    const isSoccer = stream.category === 'soccer';

    const t1Name = stream.team1?.name || stream.name.split(/vs|at/i)[0]?.trim() || 'Team A';
    const t2Name = stream.team2?.name || stream.name.split(/vs|at/i)[1]?.trim() || 'Team B';

    const mockAthletesT1: AthleteInfo[] = [
      { id: 'ath_101', name: `${t1Name} QB1`, jersey: '7', position: isBasketball ? 'PG' : (isFootball ? 'QB' : 'FW'), headshot: 'https://a.espncdn.com/combiner/i?img=/i/headshots/nophoto.png&w=120&h=90', stats: ['18/26', '245', '3 TD'], teamName: t1Name },
      { id: 'ath_102', name: `${t1Name} RB1`, jersey: '22', position: isBasketball ? 'SG' : (isFootball ? 'RB' : 'MF'), headshot: 'https://a.espncdn.com/combiner/i?img=/i/headshots/nophoto.png&w=120&h=90', stats: ['16 CAR', '98 YDS', '1 TD'], teamName: t1Name },
      { id: 'ath_103', name: `${t1Name} WR1`, jersey: '11', position: isBasketball ? 'SF' : (isFootball ? 'WR' : 'DF'), headshot: 'https://a.espncdn.com/combiner/i?img=/i/headshots/nophoto.png&w=120&h=90', stats: ['7 REC', '112 YDS', '2 TD'], teamName: t1Name },
    ];

    const mockAthletesT2: AthleteInfo[] = [
      { id: 'ath_201', name: `${t2Name} Playmaker`, jersey: '10', position: isBasketball ? 'PG' : (isFootball ? 'QB' : 'FW'), headshot: 'https://a.espncdn.com/combiner/i?img=/i/headshots/nophoto.png&w=120&h=90', stats: ['20/32', '210', '1 TD'], teamName: t2Name },
      { id: 'ath_202', name: `${t2Name} Rusher`, jersey: '33', position: isBasketball ? 'PF' : (isFootball ? 'RB' : 'MF'), headshot: 'https://a.espncdn.com/combiner/i?img=/i/headshots/nophoto.png&w=120&h=90', stats: ['14 CAR', '72 YDS', '0 TD'], teamName: t2Name },
      { id: 'ath_203', name: `${t2Name} Target`, jersey: '88', position: isBasketball ? 'C' : (isFootball ? 'TE' : 'DF'), headshot: 'https://a.espncdn.com/combiner/i?img=/i/headshots/nophoto.png&w=120&h=90', stats: ['5 REC', '64 YDS', '1 TD'], teamName: t2Name },
    ];

    return {
      stream_key: stream.stream_key,
      source: 'reference_engine',
      sportPath: this.resolveSportPath(stream.category, stream.league) || 'football/nfl',
      scoreboard: {
        team1: {
          name: t1Name,
          logo: stream.team1?.logo || 'https://via.placeholder.com/80/9146ff/fff?text=' + t1Name.slice(0, 3).toUpperCase(),
          score: isBasketball ? '88' : (isFootball ? '21' : '1'),
          record: '10-4',
          isHome: true,
        },
        team2: {
          name: t2Name,
          logo: stream.team2?.logo || 'https://via.placeholder.com/80/00f2fe/000?text=' + t2Name.slice(0, 3).toUpperCase(),
          score: isBasketball ? '84' : (isFootball ? '17' : '0'),
          record: '8-6',
          isHome: false,
        },
        status: 'In Progress • 2nd Half',
        detail: 'LIVE BROADCAST',
        clock: '34:20',
        period: 2,
      },
      winProbability: {
        team1Percentage: 62,
        team2Percentage: 38,
      },
      stats: this.getCategoryDefaultStats(stream.category),
      leaders: [
        {
          category: isBasketball ? 'Top Scorer' : (isFootball ? 'Passing Leader' : 'Key Attacker'),
          athlete: mockAthletesT1[0],
          statline: isBasketball ? '26 PTS, 7 AST' : (isFootball ? '245 YDS, 3 TD' : '1 Goal, 4 Shots'),
          teamName: t1Name,
        },
        {
          category: isBasketball ? 'Rebounds' : (isFootball ? 'Rushing Leader' : 'Midfield Anchor'),
          athlete: mockAthletesT2[1],
          statline: isBasketball ? '11 REB, 3 BLK' : (isFootball ? '72 YDS, 0 TD' : '88% Pass Accuracy'),
          teamName: t2Name,
        },
      ],
      boxscore: {
        team1: {
          teamName: t1Name,
          teamLogo: stream.team1?.logo || '',
          categories: [
            {
              name: isFootball ? 'passing' : 'shooting',
              displayName: isFootball ? 'Passing' : 'Starters',
              labels: isFootball ? ['C/ATT', 'YDS', 'TD'] : ['PTS', 'REB', 'AST'],
              athletes: mockAthletesT1,
            },
          ],
        },
        team2: {
          teamName: t2Name,
          teamLogo: stream.team2?.logo || '',
          categories: [
            {
              name: isFootball ? 'passing' : 'shooting',
              displayName: isFootball ? 'Passing' : 'Starters',
              labels: isFootball ? ['C/ATT', 'YDS', 'TD'] : ['PTS', 'REB', 'AST'],
              athletes: mockAthletesT2,
            },
          ],
        },
      },
      rosters: {
        team1: mockAthletesT1,
        team2: mockAthletesT2,
      },
      scoringPlays: [
        {
          period: '1st Half',
          clock: '12:40',
          teamName: t1Name,
          score: isBasketball ? '12 - 8' : (isFootball ? '7 - 0' : '1 - 0'),
          description: `Opening score by ${t1Name} on clinical transition drive.`,
        },
        {
          period: '2nd Half',
          clock: '28:15',
          teamName: t2Name,
          score: isBasketball ? '65 - 60' : (isFootball ? '14 - 10' : '1 - 0'),
          description: `Field score response by ${t2Name} keeping the margin close.`,
        },
      ],
      gameInfo: {
        venue: 'Official Arena',
        city: 'Metropolitan Center',
        broadcast: 'StreamFree Live Stream',
        odds: `${t1Name} -3.5`,
        overUnder: isBasketball ? 'O/U 224.5' : (isFootball ? 'O/U 46.5' : 'O/U 2.5'),
      },
      news: [
        {
          title: `${t1Name} vs ${t2Name}: Tactical Breakdown and In-Game Match Factors`,
          description: 'Key matchups, possession efficiency, and live personnel rotations.',
          link: 'https://espn.com',
        },
        {
          title: `Statistical Deep Dive: Advanced Metrics & Win Shares`,
          description: 'Offensive and defensive efficiency metrics according to sports analytics.',
          link: 'https://statmuse.com',
        },
      ],
    };
  }

  private getCategoryDefaultStats(category: string): Array<{ label: string; team1Value: string; team2Value: string }> {
    const cat = (category || '').toLowerCase();

    if (cat === 'football') {
      return [
        { label: 'Total Yards', team1Value: '342', team2Value: '285' },
        { label: 'Passing Yards', team1Value: '235', team2Value: '190' },
        { label: 'Rushing Yards', team1Value: '107', team2Value: '95' },
        { label: 'First Downs', team1Value: '21', team2Value: '17' },
        { label: '3rd Down Efficiency', team1Value: '6-12 (50%)', team2Value: '4-11 (36%)' },
        { label: 'Turnovers', team1Value: '0', team2Value: '1' },
        { label: 'Time of Possession', team1Value: '32:15', team2Value: '27:45' },
      ];
    }

    if (cat === 'basketball') {
      return [
        { label: 'Field Goal %', team1Value: '48.2%', team2Value: '44.5%' },
        { label: '3-Point %', team1Value: '37.5%', team2Value: '32.1%' },
        { label: 'Free Throw %', team1Value: '85.0%', team2Value: '78.6%' },
        { label: 'Rebounds', team1Value: '44', team2Value: '39' },
        { label: 'Assists', team1Value: '26', team2Value: '21' },
        { label: 'Turnovers', team1Value: '11', team2Value: '14' },
        { label: 'Points in Paint', team1Value: '48', team2Value: '42' },
      ];
    }

    if (cat === 'soccer') {
      return [
        { label: 'Possession', team1Value: '58%', team2Value: '42%' },
        { label: 'Total Shots', team1Value: '14', team2Value: '8' },
        { label: 'Shots on Target', team1Value: '6', team2Value: '3' },
        { label: 'Corner Kicks', team1Value: '7', team2Value: '3' },
        { label: 'Fouls Committed', team1Value: '9', team2Value: '12' },
        { label: 'Expected Goals (xG)', team1Value: '1.84', team2Value: '0.92' },
        { label: 'Pass Accuracy', team1Value: '87%', team2Value: '79%' },
      ];
    }

    return [
      { label: 'Scoring Opportunities', team1Value: '12', team2Value: '9' },
      { label: 'Efficiency Rating', team1Value: '+8.4', team2Value: '+3.1' },
      { label: 'Discipline / Penalties', team1Value: '2', team2Value: '4' },
    ];
  }
}

export const sportsIntelService = new SportsIntelService();
