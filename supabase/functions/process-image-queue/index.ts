import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode } from "https://deno.land/std@0.177.0/encoding/base64.ts";

// <<-- ΑΝΑΒΑΘΜΙΣΜΕΝΟ PROMPT v5 -->>
const OAI_PROMPT = `
You are an expert trading card identifier, preparing structured data for an asset management tool.
From the provided images, extract the card's details precisely.
Your response MUST be in JSON format. Prioritize the 'front' image for primary details if available.

**CRITICAL FIRST STEP: Determine if this is a 'Single' card or a 'Lot'.**
- If only ONE card is clearly depicted, proceed as a 'Single'.
- If MULTIPLE distinct cards are visible, you MUST treat it as a 'Lot'.

**JSON Schema & Instructions:**

--- IF 'Single' ---
- **title**: (string) CONSTRUCT IT using this template: '[Autograph?] [Player Name] [Year] [Set] [Team] [/Numbering?]'.
  - Example: "Autograph Serge Gnabry 2023-2024 Topps Museum Collection FC Bayern Munich /99"
- **notes**: (string) A concise description in ENGLISH. Mention key features like player, team, set, and any special characteristics.
  - Example: "Serge Gnabry autograph card from 2023-2024 Topps Museum Collection. Numbered /99. A great collectible for any Bayern Munich fan."

--- IF 'Lot' ---
- **title**: (string) CONSTRUCT IT using this template: 'Lot of [Number of Cards] [Set] cards - [Team]'.
  - Example: "Lot of 5 Topps Chrome cards - FSV Mainz 05"
- **notes**: (string) A concise description in ENGLISH. SUMMARIZE the content. List the most prominent players you can identify.
  - Example: "Lot of 5 cards from the Topps Chrome set, featuring players from FSV Mainz 05. Includes Anton Stach, Moussa Niakhaté, Jeremiah St. Juste, and Jonathan Burkardt."

--- COMMON FIELDS (for both Single & Lot) ---
- **set**: (string) The specific set of the card(s) (e.g., "Topps Chrome", "Topps Museum Collection").
- **condition**: (string) The card's condition (e.g., "Near Mint"). Leave null if unclear.
- **team**: (string) The primary team featured. IMPORTANT: Be consistent. For Bayern, always return "FC Bayern Munich". For Mainz, use "FSV Mainz 05".
- **kind**: (string) MUST be "Single" or "Lot". This is mandatory.
- **numbering**: (string) For 'Single' cards, the serial number suffix (e.g., "/25", "/99"). If not numbered, use "base". For 'Lot', this field should be null.
`;

// Helper για "καθαρισμό" ονομάτων ομάδων
const teamNameMap: { [key: string]: string } = {
  // Germany (Originals)
  'fc bayern münchen': 'FC Bayern Munich', 'bayern munich': 'FC Bayern Munich', 'bayern münchen': 'FC Bayern Munich',
  'fsv mainz 05': 'FSV Mainz 05', 'mainz 05': 'FSV Mainz 05',

  // England: Premier League
  'arsenal fc': 'Arsenal FC', 'arsenal': 'Arsenal FC', 'afc': 'Arsenal FC', 'gunners': 'Arsenal FC', 'άρσεναλ': 'Arsenal FC',
  'aston villa fc': 'Aston Villa FC', 'aston villa': 'Aston Villa FC', 'avfc': 'Aston Villa FC', 'villa': 'Aston Villa FC', 'άστον βίλα': 'Aston Villa FC',
  'afc bournemouth': 'AFC Bournemouth', 'bournemouth': 'AFC Bournemouth', 'afcb': 'AFC Bournemouth', 'cherries': 'AFC Bournemouth', 'μπόρνμουθ': 'AFC Bournemouth',
  'brentford fc': 'Brentford FC', 'brentford': 'Brentford FC', 'a-team': 'Brentford FC', 'μπρέντφορντ': 'Brentford FC',
  'brighton & hove albion fc': 'Brighton & Hove Albion FC', 'brighton & hove albion': 'Brighton & Hove Albion FC', 'brighton': 'Brighton & Hove Albion FC', 'bhfc': 'Brighton & Hove Albion FC', 'seagulls': 'Brighton & Hove Albion FC', 'μπράιτον': 'Brighton & Hove Albion FC',
  'chelsea fc': 'Chelsea FC', 'chelsea': 'Chelsea FC', 'cfc': 'Chelsea FC', 'the blues': 'Chelsea FC', 'τσέλσι': 'Chelsea FC',
  'crystal palace fc': 'Crystal Palace FC', 'crystal palace': 'Crystal Palace FC', 'cpfc': 'Crystal Palace FC', 'eagles': 'Crystal Palace FC', 'κρίσταλ πάλας': 'Crystal Palace FC',
  'everton fc': 'Everton FC', 'everton': 'Everton FC', 'efc': 'Everton FC', 'toffees': 'Everton FC', 'έβερτον': 'Everton FC',
  'fulham fc': 'Fulham FC', 'fulham': 'Fulham FC', 'ffc': 'Fulham FC', 'cottagers': 'Fulham FC', 'φούλαμ': 'Fulham FC',
  'ipswich town fc': 'Ipswich Town FC', 'ipswich town': 'Ipswich Town FC', 'ipswich': 'Ipswich Town FC', 'itfc': 'Ipswich Town FC', 'tractor boys': 'Ipswich Town FC', 'ίπσουιτς': 'Ipswich Town FC',
  'leicester city fc': 'Leicester City FC', 'leicester city': 'Leicester City FC', 'leicester': 'Leicester City FC', 'lcfc': 'Leicester City FC', 'foxes': 'Leicester City FC', 'λέστερ': 'Leicester City FC',
  'liverpool fc': 'Liverpool FC', 'liverpool': 'Liverpool FC', 'lfc': 'Liverpool FC', 'reds': 'Liverpool FC', 'λίβερπουλ': 'Liverpool FC',
  'manchester city fc': 'Manchester City FC', 'manchester city': 'Manchester City FC', 'mcfc': 'Manchester City FC', 'city': 'Manchester City FC', 'μάντσεστερ σίτι': 'Manchester City FC',
  'manchester united fc': 'Manchester United FC', 'manchester united': 'Manchester United FC', 'mufc': 'Manchester United FC', 'united': 'Manchester United FC', 'μάντσεστερ γιουνάιτεντ': 'Manchester United FC',
  'newcastle united fc': 'Newcastle United FC', 'newcastle united': 'Newcastle United FC', 'newcastle': 'Newcastle United FC', 'nufc': 'Newcastle United FC', 'magpies': 'Newcastle United FC', 'νιούκαστλ': 'Newcastle United FC',
  'nottingham forest fc': 'Nottingham Forest FC', 'nottingham forest': 'Nottingham Forest FC', 'nffc': 'Nottingham Forest FC', 'forest': 'Nottingham Forest FC', 'νότιγχαμ φόρεστ': 'Nottingham Forest FC',
  'southampton fc': 'Southampton FC', 'southampton': 'Southampton FC', 'sfc': 'Southampton FC', 'saints': 'Southampton FC', 'σαουθάμπτον': 'Southampton FC',
  'tottenham hotspur fc': 'Tottenham Hotspur FC', 'tottenham hotspur': 'Tottenham Hotspur FC', 'tottenham': 'Tottenham Hotspur FC', 'thfc': 'Tottenham Hotspur FC', 'spurs': 'Tottenham Hotspur FC', 'τότεναμ': 'Tottenham Hotspur FC',
  'west ham united fc': 'West Ham United FC', 'west ham united': 'West Ham United FC', 'west ham': 'West Ham United FC', 'whufc': 'West Ham United FC', 'hammers': 'West Ham United FC', 'γουέστ χαμ': 'West Ham United FC',
  'wolverhampton wanderers fc': 'Wolverhampton Wanderers FC', 'wolverhampton wanderers': 'Wolverhampton Wanderers FC', 'wolves': 'Wolverhampton Wanderers FC', 'wwfc': 'Wolverhampton Wanderers FC', 'γουλβς': 'Wolverhampton Wanderers FC',

  // Spain: La Liga
  'deportivo alavés': 'Deportivo Alavés', 'alavés': 'Deportivo Alavés', 'alaves': 'Deportivo Alavés', 'αλαβές': 'Deportivo Alavés',
  'athletic club': 'Athletic Club', 'athletic bilbao': 'Athletic Club', 'αθλέτικ μπιλμπάο': 'Athletic Club',
  'club atlético de madrid': 'Club Atlético de Madrid', 'atlético de madrid': 'Club Atlético de Madrid', 'atletico madrid': 'Club Atlético de Madrid', 'atletico': 'Club Atlético de Madrid', 'atleti': 'Club Atlético de Madrid', 'ατλέτικο μαδρίτης': 'Club Atlético de Madrid',
  'fc barcelona': 'FC Barcelona', 'barcelona': 'FC Barcelona', 'barca': 'FC Barcelona', 'μπαρτσελόνα': 'FC Barcelona',
  'real betis balompié': 'Real Betis Balompié', 'real betis': 'Real Betis Balompié', 'betis': 'Real Betis Balompié', 'ρεάλ μπέτις': 'Real Betis Balompié',
  'rc celta de vigo': 'RC Celta de Vigo', 'celta de vigo': 'RC Celta de Vigo', 'celta vigo': 'RC Celta de Vigo', 'θέλτα βίγο': 'RC Celta de Vigo',
  'rcd espanyol': 'RCD Espanyol', 'espanyol': 'RCD Espanyol', 'εσπανιόλ': 'RCD Espanyol',
  'getafe cf': 'Getafe CF', 'getafe': 'Getafe CF', 'χετάφε': 'Getafe CF',
  'girona fc': 'Girona FC', 'girona': 'Girona FC', 'χιρόνα': 'Girona FC',
  'ud las palmas': 'UD Las Palmas', 'las palmas': 'UD Las Palmas', 'λας πάλμας': 'UD Las Palmas',
  'cd leganés': 'CD Leganés', 'leganés': 'CD Leganés', 'leganes': 'CD Leganés', 'λεγανές': 'CD Leganés',
  'rcd mallorca': 'RCD Mallorca', 'mallorca': 'RCD Mallorca', 'μαγιόρκα': 'RCD Mallorca',
  'ca osasuna': 'CA Osasuna', 'osasuna': 'CA Osasuna', 'οσασούνα': 'CA Osasuna',
  'rayo vallecano': 'Rayo Vallecano', 'rayo': 'Rayo Vallecano', 'ράγιο βαγιεκάνο': 'Rayo Vallecano',
  'real madrid cf': 'Real Madrid CF', 'real madrid': 'Real Madrid CF', 'los blancos': 'Real Madrid CF', 'ρεάλ μαδρίτης': 'Real Madrid CF',
  'real sociedad de fútbol': 'Real Sociedad de Fútbol', 'real sociedad': 'Real Sociedad de Fútbol', 'la real': 'Real Sociedad de Fútbol', 'sociedad': 'Real Sociedad de Fútbol', 'ρεάλ σοσιεδάδ': 'Real Sociedad de Fútbol',
  'sevilla fc': 'Sevilla FC', 'sevilla': 'Sevilla FC', 'σεβίλλη': 'Sevilla FC',
  'valencia cf': 'Valencia CF', 'valencia': 'Valencia CF', 'βαλένθια': 'Valencia CF',
  'real valladolid cf': 'Real Valladolid CF', 'valladolid': 'Real Valladolid CF', 'βαγιαδολίδ': 'Real Valladolid CF',
  'villarreal cf': 'Villarreal CF', 'villarreal': 'Villarreal CF', 'yellow submarine': 'Villarreal CF', 'βιγιαρεάλ': 'Villarreal CF',

  // Italy: Serie A
  'atalanta bc': 'Atalanta BC', 'atalanta': 'Atalanta BC', 'αταλάντα': 'Atalanta BC',
  'bologna fc 1909': 'Bologna FC 1909', 'bologna': 'Bologna FC 1909', 'μπολόνια': 'Bologna FC 1909',
  'cagliari calcio': 'Cagliari Calcio', 'cagliari': 'Cagliari Calcio', 'κάλιαρι': 'Cagliari Calcio',
  'como 1907': 'Como 1907', 'como': 'Como 1907', 'κόμο': 'Como 1907',
  'empoli fc': 'Empoli FC', 'empoli': 'Empoli FC', 'έμπολι': 'Empoli FC',
  'acf fiorentina': 'ACF Fiorentina', 'fiorentina': 'ACF Fiorentina', 'φιορεντίνα': 'ACF Fiorentina',
  'genoa cfc': 'Genoa CFC', 'genoa': 'Genoa CFC', 'τζένοα': 'Genoa CFC',
  'fc internazionale milano': 'FC Internazionale Milano', 'inter': 'FC Internazionale Milano', 'internazionale': 'FC Internazionale Milano', 'ίντερ': 'FC Internazionale Milano',
  'juventus fc': 'Juventus FC', 'juventus': 'Juventus FC', 'juve': 'Juventus FC', 'γιουβέντους': 'Juventus FC',
  'ss lazio': 'SS Lazio', 'lazio': 'SS Lazio', 'λάτσιο': 'SS Lazio',
  'us lecce': 'US Lecce', 'lecce': 'US Lecce', 'λέτσε': 'US Lecce',
  'ac milan': 'AC Milan', 'milan': 'AC Milan', 'μίλαν': 'AC Milan',
  'ac monza': 'AC Monza', 'monza': 'AC Monza', 'μόντσα': 'AC Monza',
  'ssc napoli': 'SSC Napoli', 'napoli': 'SSC Napoli', 'νάπολι': 'SSC Napoli',
  'parma calcio 1913': 'Parma Calcio 1913', 'parma': 'Parma Calcio 1913', 'πάρμα': 'Parma Calcio 1913',
  'as roma': 'AS Roma', 'roma': 'AS Roma', 'ρόμα': 'AS Roma',
  'torino fc': 'Torino FC', 'torino': 'Torino FC', 'τορίνο': 'Torino FC',
  'udinese calcio': 'Udinese Calcio', 'udinese': 'Udinese Calcio', 'ουντινέζε': 'Udinese Calcio',
  'hellas verona fc': 'Hellas Verona FC', 'hellas verona': 'Hellas Verona FC', 'verona': 'Hellas Verona FC', 'ελλάς βερόνα': 'Hellas Verona FC',
  'venezia fc': 'Venezia FC', 'venezia': 'Venezia FC', 'βενέτσια': 'Venezia FC',

  // France: Ligue 1
  'angers sco': 'Angers SCO', 'angers': 'Angers SCO', 'ανζέ': 'Angers SCO',
  'aj auxerre': 'AJ Auxerre', 'auxerre': 'AJ Auxerre', 'οσέρ': 'AJ Auxerre',
  'stade brestois 29': 'Stade Brestois 29', 'brest': 'Stade Brestois 29', 'μπρεστ': 'Stade Brestois 29',
  'le havre ac': 'Le Havre AC', 'le havre': 'Le Havre AC', 'χάβρη': 'Le Havre AC',
  'rc lens': 'RC Lens', 'lens': 'RC Lens', 'λανς': 'RC Lens',
  'losc lille': 'LOSC Lille', 'lille': 'LOSC Lille', 'λιλ': 'LOSC Lille',
  'as monaco fc': 'AS Monaco FC', 'monaco': 'AS Monaco FC', 'μονακό': 'AS Monaco FC',
  'montpellier hérault sc': 'Montpellier Hérault SC', 'montpellier': 'Montpellier Hérault SC', 'μονπελιέ': 'Montpellier Hérault SC',
  'fc nantes': 'FC Nantes', 'nantes': 'FC Nantes', 'ναντ': 'FC Nantes',
  'ogc nice': 'OGC Nice', 'nice': 'OGC Nice', 'νις': 'OGC Nice',
  'olympique de marseille': 'Olympique de Marseille', 'marseille': 'Olympique de Marseille', 'om': 'Olympique de Marseille', 'μαρσέιγ': 'Olympique de Marseille',
  'olympique lyonnais': 'Olympique Lyonnais', 'lyon': 'Olympique Lyonnais', 'ol': 'Olympique Lyonnais', 'λυών': 'Olympique Lyonnais',
  'paris saint-germain fc': 'Paris Saint-Germain FC', 'paris saint-germain': 'Paris Saint-Germain FC', 'psg': 'Paris Saint-Germain FC', 'παρί σεν ζερμέν': 'Paris Saint-Germain FC',
  'stade de reims': 'Stade de Reims', 'reims': 'Stade de Reims', 'ρενς': 'Stade de Reims',
  'stade rennais fc': 'Stade Rennais FC', 'rennes': 'Stade Rennais FC', 'rennais': 'Stade Rennais FC', 'ρεν': 'Stade Rennais FC',
  'as saint-étienne': 'AS Saint-Étienne', 'saint-étienne': 'AS Saint-Étienne', 'asse': 'AS Saint-Étienne', 'σεντ ετιέν': 'AS Saint-Étienne',
  'rc strasbourg alsace': 'RC Strasbourg Alsace', 'strasbourg': 'RC Strasbourg Alsace', 'στρασβούργο': 'RC Strasbourg Alsace',
  'toulouse fc': 'Toulouse FC', 'toulouse': 'Toulouse FC', 'τουλούζ': 'Toulouse FC',

  // Portugal: Primeira Liga
  'fc arouca': 'FC Arouca', 'arouca': 'FC Arouca', 'αρούκα': 'FC Arouca',
  'avs futebol sad': 'AVS Futebol SAD', 'avs': 'AVS Futebol SAD', 'αβσ': 'AVS Futebol SAD',
  'sl benfica': 'SL Benfica', 'benfica': 'SL Benfica', 'μπενφίκα': 'SL Benfica',
  'boavista fc': 'Boavista FC', 'boavista': 'Boavista FC', 'μποαβίστα': 'Boavista FC',
  'sc braga': 'SC Braga', 'braga': 'SC Braga', 'μπράγκα': 'SC Braga',
  'casa pia ac': 'Casa Pia AC', 'casa pia': 'Casa Pia AC', 'κάζα πία': 'Casa Pia AC',
  'estoril praia': 'Estoril Praia', 'estoril': 'Estoril Praia', 'εστορίλ': 'Estoril Praia',
  'gd estrela da amadora': 'GD Estrela da Amadora', 'estrela amadora': 'GD Estrela da Amadora', 'estrela': 'GD Estrela da Amadora', 'εστρέλα αμαδόρα': 'GD Estrela da Amadora',
  'fc famalicão': 'FC Famalicão', 'famalicão': 'FC Famalicão', 'famalicao': 'FC Famalicão', 'φαμαλικάο': 'FC Famalicão',
  'sc farense': 'SC Farense', 'farense': 'SC Farense', 'φαρένσε': 'SC Farense',
  'gil vicente fc': 'Gil Vicente FC', 'gil vicente': 'Gil Vicente FC', 'ζιλ βισέντε': 'Gil Vicente FC',
  'moreirense fc': 'Moreirense FC', 'moreirense': 'Moreirense FC', 'μορεϊρένσε': 'Moreirense FC',
  'cd nacional': 'CD Nacional', 'nacional': 'CD Nacional', 'νασιονάλ': 'CD Nacional',
  'fc porto': 'FC Porto', 'porto': 'FC Porto', 'πόρτο': 'FC Porto',
  'rio ave fc': 'Rio Ave FC', 'rio ave': 'Rio Ave FC', 'ρίο άβε': 'Rio Ave FC',
  'cd santa clara': 'CD Santa Clara', 'santa clara': 'CD Santa Clara', 'σάντα κλάρα': 'CD Santa Clara',
  'sporting cp': 'Sporting CP', 'sporting lisbon': 'Sporting CP', 'sporting': 'Sporting CP', 'scp': 'Sporting CP', 'σπόρτινγκ λισαβόνας': 'Sporting CP',
  'vitória sc': 'Vitória SC', 'vitoria sc': 'Vitória SC', 'vitória de guimarães': 'Vitória SC', 'vitoria de guimaraes': 'Vitória SC', 'βιτόρια γκιμαράες': 'Vitória SC',

  // Netherlands: Eredivisie
  'afc ajax': 'AFC Ajax', 'ajax': 'AFC Ajax', 'άγιαξ': 'AFC Ajax',
  'almere city fc': 'Almere City FC', 'almere city': 'Almere City FC', 'almere': 'Almere City FC', 'αλμέρε σίτι': 'Almere City FC',
  'az alkmaar': 'AZ Alkmaar', 'az': 'AZ Alkmaar', 'alkmaar': 'AZ Alkmaar', 'άλκμααρ': 'AZ Alkmaar',
  'feyenoord rotterdam': 'Feyenoord Rotterdam', 'feyenoord': 'Feyenoord Rotterdam', 'φέγενορντ': 'Feyenoord Rotterdam',
  'fortuna sittard': 'Fortuna Sittard', 'fortuna': 'Fortuna Sittard', 'φορτούνα σιτάρντ': 'Fortuna Sittard',
  'go ahead eagles': 'Go Ahead Eagles', 'γκο αχέντ ιγκλς': 'Go Ahead Eagles',
  'fc groningen': 'FC Groningen', 'groningen': 'FC Groningen', 'χρόνινγκεν': 'FC Groningen',
  'sc heerenveen': 'sc Heerenveen', 'heerenveen': 'sc Heerenveen', 'χέρενφεν': 'sc Heerenveen',
  'heracles almelo': 'Heracles Almelo', 'heracles': 'Heracles Almelo', 'χεράκλες': 'Heracles Almelo',
  'nac breda': 'NAC Breda', 'breda': 'NAC Breda', 'nac': 'NAC Breda', 'μπρέντα': 'NAC Breda',
  'nec nijmegen': 'NEC Nijmegen', 'nec': 'NEC Nijmegen', 'nijmegen': 'NEC Nijmegen', 'ναϊμέγκεν': 'NEC Nijmegen',
  'pec zwolle': 'PEC Zwolle', 'zwolle': 'PEC Zwolle', 'τσβόλε': 'PEC Zwolle',
  'psv eindhoven': 'PSV Eindhoven', 'psv': 'PSV Eindhoven', 'eindhoven': 'PSV Eindhoven', 'αϊντχόφεν': 'PSV Eindhoven',
  'rkc waalwijk': 'RKC Waalwijk', 'waalwijk': 'RKC Waalwijk', 'rkc': 'RKC Waalwijk', 'βάαλβαϊκ': 'RKC Waalwijk',
  'sparta rotterdam': 'Sparta Rotterdam', 'sparta': 'Sparta Rotterdam', 'σπάρτα ρότερνταμ': 'Sparta Rotterdam',
  'fc twente': 'FC Twente', 'twente': 'FC Twente', 'τβέντε': 'FC Twente',
  'fc utrecht': 'FC Utrecht', 'utrecht': 'FC Utrecht', 'ουτρέχτη': 'FC Utrecht',
  'willem ii': 'Willem II', 'willem': 'Willem II', 'βίλεμ ιι': 'Willem II',

  // Turkey: Süper Lig
  'adana demirspor': 'Adana Demirspor', 'demirspor': 'Adana Demirspor', 'άδανα ντεμίρσπορ': 'Adana Demirspor',
  'alanyaspor': 'Alanyaspor', 'αλάνιασπορ': 'Alanyaspor',
  'antalyaspor': 'Antalyaspor', 'αντάλιασπορ': 'Antalyaspor',
  'beşiktaş jk': 'Beşiktaş JK', 'beşiktaş': 'Beşiktaş JK', 'besiktas': 'Beşiktaş JK', 'bjk': 'Beşiktaş JK', 'μπεσίκτας': 'Beşiktaş JK',
  'bodrum fk': 'Bodrum FK', 'bodrumspor': 'Bodrum FK', 'μπόντρουμσπορ': 'Bodrum FK',
  'çaykur rizespor': 'Çaykur Rizespor', 'rizespor': 'Çaykur Rizespor', 'ρίζεσπορ': 'Çaykur Rizespor',
  'eyüpspor': 'Eyüpspor', 'eyupspor': 'Eyüpspor', 'εγιούπσπορ': 'Eyüpspor',
  'fenerbahçe sk': 'Fenerbahçe SK', 'fenerbahçe': 'Fenerbahçe SK', 'fenerbahce': 'Fenerbahçe SK', 'fener': 'Fenerbahçe SK', 'φενερμπαχτσέ': 'Fenerbahçe SK',
  'galatasaray sk': 'Galatasaray SK', 'galatasaray': 'Galatasaray SK', 'gs': 'Galatasaray SK', 'γαλατασαράι': 'Galatasaray SK',
  'gaziantep fk': 'Gaziantep FK', 'gaziantep': 'Gaziantep FK', 'γκαζιαντέπ': 'Gaziantep FK',
  'göztepe sk': 'Göztepe SK', 'göztepe': 'Göztepe SK', 'goztepe': 'Göztepe SK', 'γκιόζτεπε': 'Göztepe SK',
  'hatayspor': 'Hatayspor', 'χατάισπορ': 'Hatayspor',
  'istanbul başakşehir fk': 'İstanbul Başakşehir FK', 'başakşehir': 'İstanbul Başakşehir FK', 'basaksehir': 'İstanbul Başakşehir FK', 'μπασακσεχίρ': 'İstanbul Başakşehir FK',
  'kasımpaşa sk': 'Kasımpaşa SK', 'kasımpaşa': 'Kasımpaşa SK', 'kasimpasa': 'Kasımpaşa SK', 'κασίμπασα': 'Kasımpaşa SK',
  'kayserispor': 'Kayserispor', 'καϊσέρισπορ': 'Kayserispor',
  'konyaspor': 'Konyaspor', 'κόνιασπορ': 'Konyaspor',
  'samsunspor': 'Samsunspor', 'σάμσουνσπορ': 'Samsunspor',
  'sivasspor': 'Sivasspor', 'σίβασπορ': 'Sivasspor',
  'trabzonspor': 'Trabzonspor', 'τράμπζονσπορ': 'Trabzonspor',

  // Brazil: Campeonato Brasileiro Série A
  'athletico paranaense': 'Athletico Paranaense', 'athletico-pr': 'Athletico Paranaense', 'ατλέτικο παραναένσε': 'Athletico Paranaense',
  'atlético goianiense': 'Atlético Goianiense', 'atletico-go': 'Atlético Goianiense', 'ατλέτικο γκοϊανιένσε': 'Atlético Goianiense',
  'atlético mineiro': 'Atlético Mineiro', 'atletico-mg': 'Atlético Mineiro', 'galo': 'Atlético Mineiro', 'ατλέτικο μινέιρο': 'Atlético Mineiro',
  'ec bahia': 'EC Bahia', 'bahia': 'EC Bahia', 'μπαΐα': 'EC Bahia',
  'botafogo de futebol e regatas': 'Botafogo de Futebol e Regatas', 'botafogo': 'Botafogo de Futebol e Regatas', 'μποταφόγκο': 'Botafogo de Futebol e Regatas',
  'red bull bragantino': 'Red Bull Bragantino', 'bragantino': 'Red Bull Bragantino', 'μπραγκαντίνο': 'Red Bull Bragantino',
  'sc corinthians paulista': 'SC Corinthians Paulista', 'corinthians': 'SC Corinthians Paulista', 'κορίνθιανς': 'SC Corinthians Paulista',
  'criciúma ec': 'Criciúma EC', 'criciúma': 'Criciúma EC', 'criciuma': 'Criciúma EC', 'κρικιούμα': 'Criciúma EC',
  'cruzeiro ec': 'Cruzeiro EC', 'cruzeiro': 'Cruzeiro EC', 'κρουζέιρο': 'Cruzeiro EC',
  'cuiabá ec': 'Cuiabá EC', 'cuiabá': 'Cuiabá EC', 'cuiaba': 'Cuiabá EC', 'κουιαμπά': 'Cuiabá EC',
  'cr flamengo': 'CR Flamengo', 'flamengo': 'CR Flamengo', 'φλαμένγκο': 'CR Flamengo',
  'fluminense fc': 'Fluminense FC', 'fluminense': 'Fluminense FC', 'φλουμινένσε': 'Fluminense FC',
  'fortaleza ec': 'Fortaleza EC', 'fortaleza': 'Fortaleza EC', 'φορταλέζα': 'Fortaleza EC',
  'grêmio foot-ball porto alegrense': 'Grêmio Foot-Ball Porto Alegrense', 'grêmio': 'Grêmio Foot-Ball Porto Alegrense', 'gremio': 'Grêmio Foot-Ball Porto Alegrense', 'γκρέμιο': 'Grêmio Foot-Ball Porto Alegrense',
  'sc internacional': 'SC Internacional', 'internacional': 'SC Internacional', 'ιντερνασιονάλ': 'SC Internacional',
  'ec juventude': 'EC Juventude', 'juventude': 'EC Juventude', 'γιουβεντούδε': 'EC Juventude',
  'se palmeiras': 'SE Palmeiras', 'palmeiras': 'SE Palmeiras', 'παλμέιρας': 'SE Palmeiras',
  'são paulo fc': 'São Paulo FC', 'são paulo': 'São Paulo FC', 'sao paulo': 'São Paulo FC', 'σάο πάολο': 'São Paulo FC',
  'cr vasco da gama': 'CR Vasco da Gama', 'vasco da gama': 'CR Vasco da Gama', 'vasco': 'CR Vasco da Gama', 'βάσκο ντα γκάμα': 'CR Vasco da Gama',
  'ec vitória': 'EC Vitória', 'vitória': 'EC Vitória', 'vitoria': 'EC Vitória', 'βιτόρια': 'EC Vitória',

  // USA: Major League Soccer (MLS)
  'atlanta united fc': 'Atlanta United FC', 'atlanta united': 'Atlanta United FC', 'atlanta': 'Atlanta United FC', 'ατλάντα γιουνάιτεντ': 'Atlanta United FC',
  'austin fc': 'Austin FC', 'austin': 'Austin FC', 'όστιν': 'Austin FC',
  'charlotte fc': 'Charlotte FC', 'charlotte': 'Charlotte FC', 'σάρλοτ': 'Charlotte FC',
  'chicago fire fc': 'Chicago Fire FC', 'chicago fire': 'Chicago Fire FC', 'chicago': 'Chicago Fire FC', 'σικάγο φάιρ': 'Chicago Fire FC',
  'fc cincinnati': 'FC Cincinnati', 'cincinnati': 'FC Cincinnati', 'σινσινάτι': 'FC Cincinnati',
  'colorado rapids': 'Colorado Rapids', 'colorado': 'Colorado Rapids', 'κολοράντο ράπιντς': 'Colorado Rapids',
  'columbus crew': 'Columbus Crew', 'columbus': 'Columbus Crew', 'κολόμπους κρου': 'Columbus Crew',
  'fc dallas': 'FC Dallas', 'dallas': 'FC Dallas', 'ντάλας': 'FC Dallas',
  'd.c. united': 'D.C. United', 'dc united': 'D.C. United', 'ντι σι γιουνάιτεντ': 'D.C. United',
  'houston dynamo fc': 'Houston Dynamo FC', 'houston dynamo': 'Houston Dynamo FC', 'houston': 'Houston Dynamo FC', 'χιούστον ντιναμό': 'Houston Dynamo FC',
  'sporting kansas city': 'Sporting Kansas City', 'sporting kc': 'Sporting Kansas City', 'σπόρτινγκ κάνσας σίτι': 'Sporting Kansas City',
  'la galaxy': 'LA Galaxy', 'los angeles galaxy': 'LA Galaxy', 'λος άντζελες γκάλαξι': 'LA Galaxy',
  'los angeles fc': 'Los Angeles FC', 'lafc': 'Los Angeles FC', 'los angeles': 'Los Angeles FC', 'λος άντζελες': 'Los Angeles FC',
  'inter miami cf': 'Inter Miami CF', 'inter miami': 'Inter Miami CF', 'ίντερ μαϊάμι': 'Inter Miami CF',
  'minnesota united fc': 'Minnesota United FC', 'minnesota united': 'Minnesota United FC', 'minnesota': 'Minnesota United FC', 'μινεσότα γιουνάιτεντ': 'Minnesota United FC',
  'cf montréal': 'CF Montréal', 'montréal': 'CF Montréal', 'montreal': 'CF Montréal', 'μόντρεαλ': 'CF Montréal',
  'nashville sc': 'Nashville SC', 'nashville': 'Nashville SC', 'νάσβιλ': 'Nashville SC',
  'new england revolution': 'New England Revolution', 'new england': 'New England Revolution', 'νιου ίνγκλαντ ρεβολούσιον': 'New England Revolution',
  'new york city fc': 'New York City FC', 'nycfc': 'New York City FC', 'new york city': 'New York City FC', 'νιου γιορκ σίτι': 'New York City FC',
  'new york red bulls': 'New York Red Bulls', 'nyrb': 'New York Red Bulls', 'νιου γιορκ ρεντ μπουλς': 'New York Red Bulls',
  'orlando city sc': 'Orlando City SC', 'orlando city': 'Orlando City SC', 'orlando': 'Orlando City SC', 'ορλάντο σίτι': 'Orlando City SC',
  'philadelphia union': 'Philadelphia Union', 'philadelphia': 'Philadelphia Union', 'φιλαδέλφεια γιούνιον': 'Philadelphia Union',
  'portland timbers': 'Portland Timbers', 'portland': 'Portland Timbers', 'πόρτλαντ τίμπερς': 'Portland Timbers',
  'real salt lake': 'Real Salt Lake', 'rsl': 'Real Salt Lake', 'ρεάλ σολτ λέικ': 'Real Salt Lake',
  'san diego fc': 'San Diego FC', 'san diego': 'San Diego FC', 'σαν ντιέγκο': 'San Diego FC',
  'san jose earthquakes': 'San Jose Earthquakes', 'san jose': 'San Jose Earthquakes', 'σαν χοσέ έρθκουεϊκς': 'San Jose Earthquakes',
  'seattle sounders fc': 'Seattle Sounders FC', 'seattle sounders': 'Seattle Sounders FC', 'seattle': 'Seattle Sounders FC', 'σιάτλ σάουντερς': 'Seattle Sounders FC',
  'st. louis city sc': 'St. Louis City SC', 'st. louis city': 'St. Louis City SC', 'st louis': 'St. Louis City SC', 'σεντ λούις σίτι': 'St. Louis City SC',
  'toronto fc': 'Toronto FC', 'toronto': 'Toronto FC', 'τορόντο': 'Toronto FC',
  'vancouver whitecaps fc': 'Vancouver Whitecaps FC', 'vancouver whitecaps': 'Vancouver Whitecaps FC', 'vancouver': 'Vancouver Whitecaps FC', 'βανκούβερ γουάιτκαπς': 'Vancouver Whitecaps FC',

  // Saudi Arabia: Saudi Professional League
  'al-ahli saudi fc': 'Al-Ahli Saudi FC', 'al-ahli': 'Al-Ahli Saudi FC', 'al ahli': 'Al-Ahli Saudi FC', 'αλ αχλί': 'Al-Ahli Saudi FC',
  'al-ettifaq fc': 'Al-Ettifaq FC', 'al-ettifaq': 'Al-Ettifaq FC', 'al ettifaq': 'Al-Ettifaq FC', 'αλ ετιφάκ': 'Al-Ettifaq FC',
  'al-fateh sc': 'Al-Fateh SC', 'al-fateh': 'Al-Fateh SC', 'al fateh': 'Al-Fateh SC', 'αλ φατέχ': 'Al-Fateh SC',
  'al-fayha fc': 'Al-Fayha FC', 'al-fayha': 'Al-Fayha FC', 'al fayha': 'Al-Fayha FC', 'αλ φεϊχά': 'Al-Fayha FC',
  'al-hilal sfc': 'Al-Hilal SFC', 'al-hilal': 'Al-Hilal SFC', 'al hilal': 'Al-Hilal SFC', 'αλ χιλάλ': 'Al-Hilal SFC',
  'al-ittihad club': 'Al-Ittihad Club', 'al-ittihad': 'Al-Ittihad Club', 'al ittihad': 'Al-Ittihad Club', 'αλ ιτιχάντ': 'Al-Ittihad Club',
  'al-khaleej fc': 'Al-Khaleej FC', 'al-khaleej': 'Al-Khaleej FC', 'al khaleej': 'Al-Khaleej FC', 'αλ καλίτζ': 'Al-Khaleej FC',
  'al-nassr fc': 'Al-Nassr FC', 'al-nassr': 'Al-Nassr FC', 'al nassr': 'Al-Nassr FC', 'αλ νασρ': 'Al-Nassr FC',
  'al-okhdood club': 'Al-Okhdood Club', 'al-okhdood': 'Al-Okhdood Club', 'al okhdood': 'Al-Okhdood Club', 'αλ οκχντούντ': 'Al-Okhdood Club',
  'al-qadsiah fc': 'Al-Qadsiah FC', 'al-qadsiah': 'Al-Qadsiah FC', 'al qadsiah': 'Al-Qadsiah FC', 'αλ καντισίγια': 'Al-Qadsiah FC',
  'al-raed sfc': 'Al-Raed SFC', 'al-raed': 'Al-Raed SFC', 'al raed': 'Al-Raed SFC', 'αλ ραέντ': 'Al-Raed SFC',
  'al-riyadh sc': 'Al-Riyadh SC', 'al-riyadh': 'Al-Riyadh SC', 'al riyadh': 'Al-Riyadh SC', 'αλ ριάντ': 'Al-Riyadh SC',
  'al-shabab fc': 'Al-Shabab FC', 'al-shabab': 'Al-Shabab FC', 'al shabab': 'Al-Shabab FC', 'αλ σαμπάμπ': 'Al-Shabab FC',
  'al-taawoun fc': 'Al-Taawoun FC', 'al-taawoun': 'Al-Taawoun FC', 'al taawoun': 'Al-Taawoun FC', 'αλ τααβούν': 'Al-Taawoun FC',
  'al-wehda fc': 'Al-Wehda FC', 'al-wehda': 'Al-Wehda FC', 'al wehda': 'Al-Wehda FC', 'αλ γουεχντά': 'Al-Wehda FC',
  'damac fc': 'Damac FC', 'damac': 'Damac FC', 'νταμάκ': 'Damac FC',
  'al-orobah fc': 'Al-Orobah FC', 'al-orobah': 'Al-Orobah FC', 'al orobah': 'Al-Orobah FC', 'αλ ορομπά': 'Al-Orobah FC',
  'al-kholood club': 'Al-Kholood Club', 'al-kholood': 'Al-Kholood Club', 'al kholood': 'Al-Kholood Club', 'αλ κολούντ': 'Al-Kholood Club',

  // Argentina: Primera División
  'argentinos juniors': 'Argentinos Juniors', 'αρχεντίνος τζούνιορς': 'Argentinos Juniors',
  'club atlético banfield': 'Club Atlético Banfield', 'banfield': 'Club Atlético Banfield', 'μπάνφιλντ': 'Club Atlético Banfield',
  'club atlético belgrano': 'Club Atlético Belgrano', 'belgrano': 'Club Atlético Belgrano', 'μπελγράνο': 'Club Atlético Belgrano',
  'boca juniors': 'Boca Juniors', 'boca': 'Boca Juniors', 'μπόκα τζούνιορς': 'Boca Juniors',
  'central córdoba': 'Central Córdoba', 'central cordoba': 'Central Córdoba', 'σεντράλ κόρδοβα': 'Central Córdoba',
  'defensa y justicia': 'Defensa y Justicia', 'defensa': 'Defensa y Justicia', 'ντεφένσα ι χουστίσια': 'Defensa y Justicia',
  'deportivo riestra': 'Deportivo Riestra', 'riestra': 'Deportivo Riestra', 'ντεπορτίβο ριέστρα': 'Deportivo Riestra',
  'estudiantes de la plata': 'Estudiantes de La Plata', 'estudiantes': 'Estudiantes de La Plata', 'εστουδιάντες': 'Estudiantes de La Plata',
  'gimnasia y esgrima la plata': 'Gimnasia y Esgrima La Plata', 'gimnasia': 'Gimnasia y Esgrima La Plata', 'χιμνάσια λα πλάτα': 'Gimnasia y Esgrima La Plata',
  'godoy cruz antonio tomba': 'Godoy Cruz Antonio Tomba', 'godoy cruz': 'Godoy Cruz Antonio Tomba', 'γοδόι κρουζ': 'Godoy Cruz Antonio Tomba',
  'club atlético huracán': 'Club Atlético Huracán', 'huracán': 'Club Atlético Huracán', 'huracan': 'Club Atlético Huracán', 'ουρακάν': 'Club Atlético Huracán',
  'independiente': 'Independiente', 'ιντεπεντιέντε': 'Independiente',
  'independiente rivadavia': 'Independiente Rivadavia', 'rivadavia': 'Independiente Rivadavia', 'ιντεπεντιέντε ριβαδάβια': 'Independiente Rivadavia',
  'instituto acc': 'Instituto ACC', 'instituto': 'Instituto ACC', 'ινστιτούτο': 'Instituto ACC',
  'club atlético lanús': 'Club Atlético Lanús', 'lanús': 'Club Atlético Lanús', 'lanus': 'Club Atlético Lanús', 'λανούς': 'Club Atlético Lanús',
  'newell\'s old boys': 'Newell\'s Old Boys', 'newells': 'Newell\'s Old Boys', 'νιούελς ολντ μπόις': 'Newell\'s Old Boys',
  'club atlético platense': 'Club Atlético Platense', 'platense': 'Club Atlético Platense', 'πλατένσε': 'Club Atlético Platense',
  'racing club': 'Racing Club', 'racing': 'Racing Club', 'ράσινγκ κλουμπ': 'Racing Club',
  'river plate': 'River Plate', 'river': 'River Plate', 'ρίβερ πλέιτ': 'River Plate',
  'rosario central': 'Rosario Central', 'rosario': 'Rosario Central', 'ροζάριο σεντράλ': 'Rosario Central',
  'san lorenzo de almagro': 'San Lorenzo de Almagro', 'san lorenzo': 'San Lorenzo de Almagro', 'σαν λορένσο': 'San Lorenzo de Almagro',
  'club atlético sarmiento': 'Club Atlético Sarmiento', 'sarmiento': 'Club Atlético Sarmiento', 'σαρμιέντο': 'Club Atlético Sarmiento',
  'talleres de córdoba': 'Talleres de Córdoba', 'talleres': 'Talleres de Córdoba', 'ταγιέρες': 'Talleres de Córdoba',
  'club atlético tigre': 'Club Atlético Tigre', 'tigre': 'Club Atlético Tigre', 'τίγρε': 'Club Atlético Tigre',
  'club atlético tucumán': 'Club Atlético Tucumán', 'tucuman': 'Club Atlético Tucumán', 'ατλέτικο τουκουμάν': 'Club Atlético Tucumán',
  'unión de santa fe': 'Unión de Santa Fe', 'unión': 'Unión de Santa Fe', 'union': 'Unión de Santa Fe', 'ουνιόν σάντα φε': 'Unión de Santa Fe',
  'vélez sarsfield': 'Vélez Sarsfield', 'vélez': 'Vélez Sarsfield', 'velez': 'Vélez Sarsfield', 'βέλες σάρσφιλντ': 'Vélez Sarsfield',

  // Mexico: Liga MX
  'club américa': 'Club América', 'america': 'Club América', 'κλαμπ αμέρικα': 'Club América',
  'atlas fc': 'Atlas FC', 'atlas': 'Atlas FC', 'άτλας': 'Atlas FC',
  'atlético san luis': 'Atlético San Luis', 'san luis': 'Atlético San Luis', 'ατλέτικο σαν λουίς': 'Atlético San Luis',
  'cruz azul': 'Cruz Azul', 'κρους ασούλ': 'Cruz Azul',
  'cd guadalajara': 'CD Guadalajara', 'guadalajara': 'CD Guadalajara', 'chivas': 'CD Guadalajara', 'γουαδαλαχάρα': 'CD Guadalajara',
  'fc juárez': 'FC Juárez', 'juárez': 'FC Juárez', 'juarez': 'FC Juárez', 'χουάρες': 'FC Juárez',
  'club león': 'Club León', 'león': 'Club León', 'leon': 'Club León', 'λεόν': 'Club León',
  'mazatlán fc': 'Mazatlán FC', 'mazatlán': 'Mazatlán FC', 'mazatlan': 'Mazatlán FC', 'μασατλάν': 'Mazatlán FC',
  'cf monterrey': 'CF Monterrey', 'monterrey': 'CF Monterrey', 'μοντερέι': 'CF Monterrey',
  'club necaxa': 'Club Necaxa', 'necaxa': 'Club Necaxa', 'νεκάξα': 'Club Necaxa',
  'cf pachuca': 'CF Pachuca', 'pachuca': 'CF Pachuca', 'πατσούκα': 'CF Pachuca',
  'puebla fc': 'Puebla FC', 'puebla': 'Puebla FC', 'πουέμπλα': 'Puebla FC',
  'pumas unam': 'Pumas UNAM', 'pumas': 'Pumas UNAM', 'πούμας': 'Pumas UNAM',
  'querétaro fc': 'Querétaro FC', 'querétaro': 'Querétaro FC', 'queretaro': 'Querétaro FC', 'κερέταρο': 'Querétaro FC',
  'santos laguna': 'Santos Laguna', 'santos': 'Santos Laguna', 'σάντος λαγκούνα': 'Santos Laguna',
  'tigres uanl': 'Tigres UANL', 'tigres': 'Tigres UANL', 'τίγκρες': 'Tigres UANL',
  'club tijuana': 'Club Tijuana', 'tijuana': 'Club Tijuana', 'xolos': 'Club Tijuana', 'τιχουάνα': 'Club Tijuana',
  'deportivo toluca fc': 'Deportivo Toluca FC', 'toluca': 'Deportivo Toluca FC', 'τολούκα': 'Deportivo Toluca FC',
};

function normalizeTeamName(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  const lowerCaseName = name.trim().toLowerCase();
  return teamNameMap[lowerCaseName] || name.trim();
}

// Helper για να πάρουμε τον τύπο της εικόνας από το όνομα αρχείου
function getMimeType(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return 'image/jpeg'; // Default σε JPEG
  }
}

// <<-- ΑΝΑΒΑΘΜΙΣΜΕΝΗ FUNCTION -->>
// Τώρα δέχεται τα items και τον supabase client για να κατεβάσει τις εικόνες η ίδια
async function callOpenAI(items: any[], supabaseAdmin: SupabaseClient) {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

  // Μετατροπή κάθε εικόνας σε base64
  const imageContents = await Promise.all(items.map(async (item) => {
    // 1. Κατεβάζουμε το αρχείο
    const { data: blob, error } = await supabaseAdmin.storage
      .from(item.bucket_id)
      .download(item.object_name);

    if (error) {
      throw new Error(`Failed to download ${item.object_name}: ${error.message}`);
    }

    // 2. Το μετατρέπουμε σε base64
    const arrayBuffer = await blob.arrayBuffer();
    const base64String = encode(arrayBuffer);
    const mimeType = getMimeType(item.object_name);

    // 3. Το ετοιμάζουμε για το payload του API
    return {
      type: "image_url",
      image_url: { url: `data:${mimeType};base64,${base64String}` },
    };
  }));

  const content = [
    { type: "text", text: OAI_PROMPT },
    ...imageContents, // Στέλνουμε τα δεδομένα της εικόνας, όχι URL
  ];

  const payload = {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content }],
    response_format: { type: "json_object" },
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    // Προσπαθούμε να κάνουμε parse το error για καλύτερο logging
    try {
      const errorJson = JSON.parse(errorText);
      throw new Error(`OpenAI API failed: ${errorJson.error.message}`);
    } catch {
      throw new Error(`OpenAI API failed: ${errorText}`);
    }
  }

  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

// Helper για να εισάγουμε μια παύση
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

serve(async (_req) => {
  try {
    const supabaseAdmin = createClient(
      Deno.env.get("PROJECT_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    // <<-- ΝΕΑ, ΑΠΛΟΥΣΤΕΥΜΕΝΗ ΛΟΓΙΚΗ -->>
    // 1. Παίρνουμε ΟΛΑ τα νέα αρχεία που μόλις μπήκαν.
    // Η επεξεργασία είναι άμεση, δεν περιμένουμε πια.
    const { data: queueItems, error: queueError } = await supabaseAdmin
      .from("image_processing_queue")
      .select("*")
      .eq("status", "new") // <-- Παίρνουμε απευθείας τα 'new'
      .limit(50); 

    if (queueError) throw queueError;
    if (!queueItems || queueItems.length === 0) {
      return new Response(JSON.stringify({ message: "No new images to process." }), { status: 200 });
    }

    // 2. Ομαδοποίηση βάσει του νέου path (UUID)
    const groupedFiles = new Map<string, any[]>();
    for (const item of queueItems) {
      // Το path είναι πλέον: public/<group-uuid>/<role>.ext
      // Άρα το group-uuid είναι το δεύτερο στοιχείο
      const pathParts = item.object_name.split('/');
      if (pathParts.length < 2) continue; // Αγνοούμε αρχεία που δεν είναι σε φάκελο

      const groupId = pathParts[1]; // Αυτό είναι το UUID του group
      
      if (!groupedFiles.has(groupId)) {
        groupedFiles.set(groupId, []);
      }
      groupedFiles.get(groupId)!.push(item);
    }
    
    // 3. Επεξεργασία κάθε ομάδας
    for (const [groupId, items] of groupedFiles.entries()) {
      console.log(`Processing group: ${groupId}`);
      
      try {
        const aiResult = await callOpenAI(items, supabaseAdmin);

        const imageUrls: { url: string, type: 'front' | 'back' | 'other' }[] = items.map(item => {
          const url = `${Deno.env.get("PROJECT_URL")}/storage/v1/object/public/${item.bucket_id}/${item.object_name}`;
          const filename = item.object_name.split('/').pop()!;
          let type: 'front' | 'back' | 'other' = 'other';
          if (/^front/i.test(filename)) type = 'front';
          if (/^back/i.test(filename)) type = 'back';
        return { url, type };
      });
      
        const normalizedTeam = normalizeTeamName(aiResult.team);

        const frontUrl = imageUrls.find(u => u.type === 'front')?.url;
        const backUrl = imageUrls.find(u => u.type === 'back')?.url;
        
        // Ως κύρια εικόνα, παίρνουμε το front URL ή το πρώτο διαθέσιμο.
        const primaryImageUrl = frontUrl || imageUrls[0]?.url;

        const upsertData = {
          title: aiResult.title || groupId, // Fallback στο UUID αν το AI αποτύχει
          set: aiResult.set,
          condition: aiResult.condition,
          team: normalizedTeam,
          notes: aiResult.notes,
          kind: aiResult.kind || (items.length > 2 ? 'Lot' : 'Single'), // Improved fallback
          status: 'New',
          numbering: aiResult.numbering,
          image_url_front: primaryImageUrl,
          image_url_back: backUrl,
        };
        
        const { error: upsertError } = await supabaseAdmin.rpc('upsert_card', { payload: upsertData });
        if (upsertError) throw upsertError;

        // Σημειώνουμε τα items ως "done"
        const idsToUpdate = items.map(i => i.id);
        await supabaseAdmin.from("image_processing_queue").update({ status: 'done' }).in('id', idsToUpdate);

        // Παύση για να αποφύγουμε το rate limit
        await delay(2000);

      } catch (e: any) {
        console.error(`Failed to process group ${groupId}:`, e.message);
        const idsToUpdate = items.map(i => i.id);

        const isTransientError = e.message.includes("rate_limit_exceeded") || 
                                 e.message.includes("502") || 
                                 e.message.includes("Bad gateway") ||
                                 e.message.includes("500") ||
                                 e.message.includes("503") ||
                                 e.message.includes("504");

        // Τώρα, ΟΛΑ τα λάθη είναι μόνιμα γιατί δεν υπάρχει retry mechanism με cron.
        // Αν αποτύχει, πρέπει να το δει ο χρήστης.
        if (isTransientError) {
          console.warn(`Transient error for ${groupId}. Marking as 'error' for manual review.`);
        }
        
        await supabaseAdmin.from("image_processing_queue").update({ status: 'error' }).in('id', idsToUpdate);
      }
    }

    return new Response(JSON.stringify({ message: `Processed ${groupedFiles.size} groups.` }), { status: 200 });

  } catch (e: any) {
    console.error("An unexpected error occurred in the main block:", e);
    return new Response(JSON.stringify({ error: 'Bad request or unexpected error', details: e.message }), { status: 400 });
  }
});