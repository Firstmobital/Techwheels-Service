import fs from 'fs'
import path from 'path'

const rawCsv = `id,Service Type,Model,Fuel,Services,Price,Labour
1,First Service,Altroz,Petrol,Distilled Water,20,
2,First Service,Altroz,Petrol,Shampoo,120,
3,First Service,Altroz,Petrol,Seat Protection Cover,80,
4,First Service,Altroz,Petrol,Coolant Top Up,100,
5,First Service,Altroz,Petrol,Oil Filter Change,179,
6,First Service,Altroz,Petrol,Sunroof Greece,800,
7,First Service,Altroz,Petrol,AC Disinfection,800,
8,First Service,Altroz,Petrol,Antirust Underbody,1900,
9,First Service,Altroz,Petrol,Antirust Cavity,1600,
11,First Service,Altroz,Petrol,Interior cleaning,1300,
12,First Service,Altroz,Petrol,Interior cleaning standard,875,
13,First Service,Altroz,Petrol,Paint Protection ,1100,
14,First Service,Altroz,Petrol,Service Pro Plus,300,
16,First Service,Altroz,Petrol,Surface Coating,1800,
17,First Service,Altroz,Petrol,Engine Wiring Surface,800,
18,First Service,Altroz,Petrol,Oil Flushing,800,
19,First Service,Altroz,Petrol,TBC Clean,800,
20,First Service,Altroz,Petrol,Exhaust Cleaning,1200,
6,First Service,Altroz,Diesel,Distilled Water,20,
7,First Service,Altroz,Diesel,Shampoo,120,
8,First Service,Altroz,Diesel,Coolant Top Up,100,
9,First Service,Altroz,Diesel,Oil Filter Change,192,
10,First Service,Altroz,Diesel,Sunroof Greece,800,
11,First Service,Altroz,CNG,Distilled Water,20,
12,First Service,Altroz,CNG,Shampoo,120,
13,First Service,Altroz,CNG,Coolant Top Up,100,
14,First Service,Altroz,CNG,Oil Filter Change,179,
15,First Service,Altroz,CNG,Sunroof Greece,800,
16,First Service,Tiago,Petrol,Distilled Water,20,
17,First Service,Tiago,Petrol,Shampoo,120,
18,First Service,Tiago,Petrol,Coolant Top Up,100,
19,First Service,Tiago,Petrol,Oil Filter Change,179,
20,First Service,Tiago,Diesel,Distilled Water,20,
21,First Service,Tiago,Diesel,Shampoo,120,
22,First Service,Tiago,Diesel,Coolant Top Up,100,
23,First Service,Tiago,Diesel,Oil Filter Change,192,
24,First Service,Tiago,CNG,Distilled Water,20,
25,First Service,Tiago,CNG,Shampoo,120,
26,First Service,Tiago,CNG,Coolant Top Up,100,
27,First Service,Tiago,CNG,Oil Filter Change,170,
28,First Service,Tiago,EV,Distilled Water,20,
29,First Service,Tiago,EV,Shampoo,120,
30,First Service,Tiago,EV,Coolant Top Up,212,
31,First Service,Nexon,Petrol,Distilled Water,20,
32,First Service,Nexon,Petrol,Shampoo,120,
33,First Service,Nexon,Petrol,Coolant Top Up,100,
34,First Service,Nexon,Petrol,Oil Filter Change,179,
35,First Service,Nexon,Petrol,Sunroof Greece,800,
36,First Service,Nexon,Diesel,Distilled Water,20,
37,First Service,Nexon,Diesel,Shampoo,120,
38,First Service,Nexon,Diesel,Coolant Top Up,100,
39,First Service,Nexon,Diesel,Oil Filter Change,192,
40,First Service,Nexon,Diesel,Sunroof Greece,800,
41,First Service,Nexon,CNG,Distilled Water,20,
42,First Service,Nexon,CNG,Shampoo,120,
43,First Service,Nexon,CNG,Coolant Top Up,100,
44,First Service,Nexon,CNG,Oil Filter Change,192,
45,First Service,Nexon,CNG,Sunroof Greece,800,
46,First Service,Nexon,EV,Distilled Water,20,
47,First Service,Nexon,EV,Shampoo,120,
48,First Service,Nexon,EV,Coolant Top Up,212,
49,First Service,Nexon,EV,Sunroof Greece,800,
50,First Service,Punch,Petrol,Distilled Water,20,
51,First Service,Punch,Petrol,Shampoo,120,
52,First Service,Punch,Petrol,Coolant Top Up,100,
53,First Service,Punch,Petrol,Oil Filter Change,179,
54,First Service,Punch,Petrol,Sunroof Greece,800,
55,First Service,Punch,CNG,Distilled Water,20,
56,First Service,Punch,CNG,Shampoo,120,
57,First Service,Punch,CNG,Coolant Top Up,100,
58,First Service,Punch,CNG,Oil Filter Change,179,
59,First Service,Punch,CNG,Sunroof Greece,800,
60,First Service,Punch,EV,Distilled Water,20,
61,First Service,Punch,EV,Shampoo,120,
62,First Service,Punch,EV,Coolant Top Up,212,
63,First Service,Punch,EV,Sunroof Greece,800,
64,First Service,Tigor,Petrol,Distilled Water,20,
65,First Service,Tigor,Petrol,Shampoo,120,
66,First Service,Tigor,Petrol,Coolant Top Up,100,
67,First Service,Tigor,Petrol,Oil Filter Change,179,
68,First Service,Tigor,Diesel,Distilled Water,20,
69,First Service,Tigor,Diesel,Shampoo,120,
70,First Service,Tigor,Diesel,Coolant Top Up,100,
71,First Service,Tigor,Diesel,Oil Filter Change,192,
72,First Service,Tigor,CNG,Distilled Water,20,
73,First Service,Tigor,CNG,Shampoo,120,
74,First Service,Tigor,CNG,Coolant Top Up,100,
75,First Service,Tigor,CNG,Oil Filter Change,170,
76,First Service,Tigor,EV,Distilled Water,20,
77,First Service,Tigor,EV,Shampoo,120,
78,First Service,Tigor,EV,Coolant Top Up,212,
79,First Service,Curvv,Petrol,Shampoo,120,
80,First Service,Curvv,Petrol,Coolant Top Up,100,
81,First Service,Curvv,Petrol,Oil Filter Change,,
82,First Service,Curvv,Petrol,Sunroof Greece,800,
83,First Service,Curvv,Diesel,Distilled Water,20,
84,First Service,Curvv,Diesel,Shampoo,120,
85,First Service,Curvv,Diesel,Coolant Top Up,100,
86,First Service,Curvv,Diesel,Oil Filter Change,,
87,First Service,Curvv,Diesel,Sunroof Greece,800,
88,First Service,Curvv,EV,Distilled Water,20,
89,First Service,Curvv,EV,Shampoo,120,
90,First Service,Curvv,EV,Coolant Top Up,212,
91,First Service,Curvv,EV,Sunroof Greece,800,
92,First Service,Harrier,Diesel,Distilled Water,20,
93,First Service,Harrier,Diesel,Shampoo,120,
94,First Service,Harrier,Diesel,Coolant Top Up,100,
95,First Service,Harrier,Diesel,Oil Filter Change,850,
96,First Service,Harrier,Diesel,Sunroof Greece,800,
,First Service,Harrier,Diesel,Def,620,
97,First Service,Safari,Diesel,Distilled Water,20,
98,First Service,Safari,Diesel,Shampoo,120,
99,First Service,Safari,Diesel,Coolant Top Up,100,
100,First Service,Safari,Diesel,Oil Filter Change,850,
101,First Service,Safari,Diesel,Sunroof Greece,800,
,First Service,Safari,Diesel,Def,620,
102,Second Service,Altroz,Petrol,Distilled Water,20,
103,Second Service,Altroz,Petrol,Shampoo,120,
104,Second Service,Altroz,Petrol,Coolant Top Up,100,
105,Second Service,Altroz,Petrol,Oil Filter Change,179,
106,Second Service,Altroz,Petrol,Sunroof Greece,800,
107,Second Service,Altroz,Diesel,Distilled Water,20,
108,Second Service,Altroz,Diesel,Shampoo,120,
109,Second Service,Altroz,Diesel,Coolant Top Up,100,
110,Second Service,Altroz,Diesel,Oil Filter Change,192,
111,Second Service,Altroz,Diesel,Sunroof Greece,800,
112,Second Service,Altroz,CNG,Distilled Water,20,
113,Second Service,Altroz,CNG,Shampoo,120,
114,Second Service,Altroz,CNG,Coolant Top Up,100,
115,Second Service,Altroz,CNG,Oil Filter Change,179,
116,Second Service,Altroz,CNG,Sunroof Greece,800,
117,Second Service,Tiago,Petrol,Distilled Water,20,
118,Second Service,Tiago,Petrol,Shampoo,120,
119,Second Service,Tiago,Petrol,Coolant Top Up,100,
120,Second Service,Tiago,Petrol,Oil Filter Change,179,
121,Second Service,Tiago,Diesel,Distilled Water,20,
122,Second Service,Tiago,Diesel,Shampoo,120,
123,Second Service,Tiago,Diesel,Coolant Top Up,100,
124,Second Service,Tiago,Diesel,Oil Filter Change,192,
125,Second Service,Tiago,CNG,Distilled Water,20,
126,Second Service,Tiago,CNG,Shampoo,120,
127,Second Service,Tiago,CNG,Coolant Top Up,100,
128,Second Service,Tiago,CNG,Oil Filter Change,179,
129,Second Service,Tiago,EV,Distilled Water,20,
130,Second Service,Tiago,EV,Shampoo,120,
131,Second Service,Tiago,EV,Coolant Top Up,212,
132,Second Service,Nexon,Petrol,Distilled Water,20,
133,Second Service,Nexon,Petrol,Shampoo,120,
134,Second Service,Nexon,Petrol,Coolant Top Up,100,
135,Second Service,Nexon,Petrol,Oil Filter Change,179,
136,Second Service,Nexon,Petrol,Sunroof Greece,800,
137,Second Service,Nexon,Diesel,Distilled Water,20,
138,Second Service,Nexon,Diesel,Shampoo,120,
139,Second Service,Nexon,Diesel,Coolant Top Up,100,
140,Second Service,Nexon,Diesel,Oil Filter Change,192,
141,Second Service,Nexon,Diesel,Sunroof Greece,800,
142,Second Service,Nexon,CNG,Distilled Water,20,
143,Second Service,Nexon,CNG,Shampoo,120,
144,Second Service,Nexon,CNG,Coolant Top Up,100,
145,Second Service,Nexon,CNG,Oil Filter Change,179,
146,Second Service,Nexon,CNG,Sunroof Greece,800,
147,Second Service,Nexon,EV,Distilled Water,20,
148,Second Service,Nexon,EV,Shampoo,120,
149,Second Service,Nexon,EV,Coolant Top Up,212,
150,Second Service,Nexon,EV,Sunroof Greece,800,
151,Second Service,Punch,Petrol,Distilled Water,20,
152,Second Service,Punch,Petrol,Shampoo,120,
153,Second Service,Punch,Petrol,Coolant Top Up,100,
154,Second Service,Punch,Petrol,Oil Filter Change,179,
155,Second Service,Punch,Petrol,Sunroof Greece,800,
,Second Service,Punch,Petrol,oil Top up,273,
156,Second Service,Punch,CNG,Distilled Water,20,
157,Second Service,Punch,CNG,Shampoo,120,
158,Second Service,Punch,CNG,Coolant Top Up,100,
159,Second Service,Punch,CNG,Oil Filter Change,179,
160,Second Service,Punch,CNG,Sunroof Greece,800,
161,Second Service,Punch,EV,Distilled Water,20,
162,Second Service,Punch,EV,Shampoo,120,
163,Second Service,Punch,EV,Coolant Top Up,212,
164,Second Service,Punch,EV,Sunroof Greece,800,
165,Second Service,Tigor,Petrol,Distilled Water,20,
166,Second Service,Tigor,Petrol,Shampoo,120,
167,Second Service,Tigor,Petrol,Coolant Top Up,100,
168,Second Service,Tigor,Petrol,Oil Filter Change,179,
169,Second Service,Tigor,Diesel,Distilled Water,20,
170,Second Service,Tigor,Diesel,Shampoo,120,
171,Second Service,Tigor,Diesel,Coolant Top Up,100,
172,Second Service,Tigor,Diesel,Oil Filter Change,192,
173,Second Service,Tigor,CNG,Distilled Water,20,
174,Second Service,Tigor,CNG,Shampoo,120,
175,Second Service,Tigor,CNG,Coolant Top Up,100,
176,Second Service,Tigor,CNG,Oil Filter Change,179,
177,Second Service,Tigor,EV,Distilled Water,20,
178,Second Service,Tigor,EV,Shampoo,120,
179,Second Service,Tigor,EV,Coolant Top Up,212,
180,Second Service,Curvv,Petrol,Shampoo,120,
181,Second Service,Curvv,Petrol,Coolant Top Up,100,
182,Second Service,Curvv,Petrol,Oil Filter Change,,
183,Second Service,Curvv,Petrol,Sunroof Greece,800,
184,Second Service,Curvv,Diesel,Distilled Water,20,
185,Second Service,Curvv,Diesel,Shampoo,120,
186,Second Service,Curvv,Diesel,Coolant Top Up,100,
187,Second Service,Curvv,Diesel,Oil Filter Change,,
188,Second Service,Curvv,Diesel,Sunroof Greece,800,
189,Second Service,Curvv,EV,Distilled Water,20,
190,Second Service,Curvv,EV,Shampoo,120,
191,Second Service,Curvv,EV,Coolant Top Up,212,
192,Second Service,Curvv,EV,Sunroof Greece,800,
193,Second Service,Harrier,Diesel,Distilled Water,20,
194,Second Service,Harrier,Diesel,Shampoo,120,
195,Second Service,Harrier,Diesel,Coolant Top Up,100,
196,Second Service,Harrier,Diesel,Oil Filter Change,850,
197,Second Service,Harrier,Diesel,Sunroof Greece,800,
,Second Service,Harrier,Diesel,Def,620,
198,Second Service,Safari,Diesel,Distilled Water,20,
199,Second Service,Safari,Diesel,Shampoo,120,
200,Second Service,Safari,Diesel,Coolant Top Up,100,
201,Second Service,Safari,Diesel,Oil Filter Change,792,
202,Second Service,Safari,Diesel,Sunroof Greece,800,
,Second Service,Safari,Diesel,oil Top up,650,
,Second Service,Safari,Diesel,Def,620,
203,Third Service,Altroz,Petrol,Distilled Water,20,
204,Third Service,Altroz,Petrol,Shampoo,120,
205,Third Service,Altroz,Petrol,Coolant Top Up,100,
206,Third Service,Altroz,Petrol,Engine Oil,2159.5,
207,Third Service,Altroz,Petrol,Oil Filter Change,179,
208,Third Service,Altroz,Petrol,AC Filter,347,
209,Third Service,Altroz,Petrol,Sunroof Greece,800,
,Third Service,Altroz,Petrol,Air Filter,850,
,Third Service,Altroz,Petrol,Alignment,737,
,Third Service,Altroz,Petrol,Balancing,550,
210,Third Service,Altroz,Diesel,Distilled Water,20,
211,Third Service,Altroz,Diesel,Shampoo,120,
212,Third Service,Altroz,Diesel,Coolant Top Up,100,
213,Third Service,Altroz,Diesel,Engine Oil,3085,
214,Third Service,Altroz,Diesel,Oil Filter Change,192,
215,Third Service,Altroz,Diesel,AC Filter,347,
216,Third Service,Altroz,Diesel,Sunroof Greece,800,
217,Third Service,Altroz,CNG,Distilled Water,20,
218,Third Service,Altroz,CNG,Shampoo,120,
219,Third Service,Altroz,CNG,Coolant Top Up,100,
220,Third Service,Altroz,CNG,Engine Oil,2159.5,
221,Third Service,Altroz,CNG,Oil Filter Change,179,
222,Third Service,Altroz,CNG,AC Filter,347,
223,Third Service,Altroz,CNG,Sunroof Greece,800,
,Third Service,Altroz,CNG,Alignment,750,
,Third Service,Altroz,CNG,Balancing,550,
,Third Service,Altroz,CNG,Air Filter,750,
224,Third Service,Tiago,Petrol,Distilled Water,20,
225,Third Service,Tiago,Petrol,Shampoo,120,
226,Third Service,Tiago,Petrol,Coolant Top Up,100,
227,Third Service,Tiago,Petrol,Engine Oil,2159.5,
228,Third Service,Tiago,Petrol,Oil Filter Change,179,
229,Third Service,Tiago,Petrol,AC Filter,241,
230,Third Service,Tiago,Diesel,Distilled Water,20,
231,Third Service,Tiago,Diesel,Shampoo,120,
232,Third Service,Tiago,Diesel,Coolant Top Up,100,
233,Third Service,Tiago,Diesel,Engine Oil,3085,
234,Third Service,Tiago,Diesel,Oil Filter Change,192,
235,Third Service,Tiago,Diesel,AC Filter,241,
236,Third Service,Tiago,CNG,Distilled Water,20,
237,Third Service,Tiago,CNG,Shampoo,120,
238,Third Service,Tiago,CNG,Coolant Top Up,100,
239,Third Service,Tiago,CNG,Engine Oil,2159.5,
240,Third Service,Tiago,CNG,Oil Filter Change,179,
241,Third Service,Tiago,CNG,AC Filter,241,
242,Third Service,Tiago,EV,Distilled Water,20,
243,Third Service,Tiago,EV,Shampoo,120,
244,Third Service,Tiago,EV,Coolant Top Up,212,
245,Third Service,Nexon,Petrol,Distilled Water,20,
246,Third Service,Nexon,Petrol,Shampoo,120,
247,Third Service,Nexon,Petrol,Coolant Top Up,100,
248,Third Service,Nexon,Petrol,Engine Oil,2159.5,
249,Third Service,Nexon,Petrol,Oil Filter Change,179,
250,Third Service,Nexon,Petrol,AC Filter,1027,
251,Third Service,Nexon,Petrol,Sunroof Greece,800,
252,Third Service,Nexon,Petrol,Alignment,750,
253,Third Service,Nexon,Petrol,Balancing,650,
254,Third Service,Nexon,Diesel,Distilled Water,20,
255,Third Service,Nexon,Diesel,Shampoo,120,
256,Third Service,Nexon,Diesel,Coolant Top Up,100,
257,Third Service,Nexon,Diesel,Engine Oil,3085,
258,Third Service,Nexon,Diesel,Oil Filter Change,192,
259,Third Service,Nexon,Diesel,AC Filter,1027,
260,Third Service,Nexon,Diesel,Sunroof Greece,800,
261,Third Service,Nexon,Diesel,Alignment,750,
262,Third Service,Nexon,Diesel,Balancing,650,
263,Third Service,Nexon,CNG,Distilled Water,20,
264,Third Service,Nexon,CNG,Shampoo,120,
265,Third Service,Nexon,CNG,Coolant Top Up,100,
266,Third Service,Nexon,CNG,Engine Oil,2159.5,
267,Third Service,Nexon,CNG,Oil Filter Change,179,
268,Third Service,Nexon,CNG,AC Filter,442,
269,Third Service,Nexon,CNG,Sunroof Greece,800,
270,Third Service,Nexon,EV,Distilled Water,20,
271,Third Service,Nexon,EV,Shampoo,120,
272,Third Service,Nexon,EV,Coolant Top Up,212,
273,Third Service,Nexon,EV,Sunroof Greece,800,
274,Third Service,Punch,Petrol,Distilled Water,20,
275,Third Service,Punch,Petrol,Shampoo,120,
276,Third Service,Punch,Petrol,Coolant Top Up,100,
277,Third Service,Punch,Petrol,Engine Oil,2159.5,
278,Third Service,Punch,Petrol,Oil Filter Change,179,
279,Third Service,Punch,Petrol,AC Filter,241,
280,Third Service,Punch,Petrol,Alignment,737,
281,Third Service,Punch,Petrol,Balancing,442,
282,Third Service,Punch,Petrol,Air Filter,650,
283,Third Service,Punch,Petrol,Sunroof Greece,800,
284,Third Service,Punch,CNG,Distilled Water,20,
285,Third Service,Punch,CNG,Shampoo,120,
286,Third Service,Punch,CNG,Coolant Top Up,100,
287,Third Service,Punch,CNG,Engine Oil,2159.5,
288,Third Service,Punch,CNG,Oil Filter Change,179,
289,Third Service,Punch,CNG,AC Filter,241,
290,Third Service,Punch,CNG,Sunroof Greece,800,
291,Third Service,Punch,EV,Distilled Water,20,
292,Third Service,Punch,EV,Shampoo,120,
293,Third Service,Punch,EV,Coolant Top Up,212,
294,Third Service,Punch,EV,Sunroof Greece,800,
295,Third Service,Tigor,Petrol,Distilled Water,20,
296,Third Service,Tigor,Petrol,Shampoo,120,
297,Third Service,Tigor,Petrol,Coolant Top Up,100,
298,Third Service,Tigor,Petrol,Engine Oil,2159.5,
299,Third Service,Tigor,Petrol,Oil Filter Change,179,
300,Third Service,Tigor,Petrol,AC Filter,241,
301,Third Service,Tigor,Diesel,Distilled Water,20,
302,Third Service,Tigor,Diesel,Shampoo,120,
303,Third Service,Tigor,Diesel,Coolant Top Up,100,
304,Third Service,Tigor,Diesel,Engine Oil,3085,
305,Third Service,Tigor,Diesel,Oil Filter Change,192,
306,Third Service,Tigor,Diesel,AC Filter,241,
307,Third Service,Tigor,CNG,Distilled Water,20,
308,Third Service,Tigor,CNG,Shampoo,120,
309,Third Service,Tigor,CNG,Coolant Top Up,100,
310,Third Service,Tigor,CNG,Engine Oil,2159.5,
311,Third Service,Tigor,CNG,Oil Filter Change,179,
312,Third Service,Tigor,CNG,AC Filter,241,
313,Third Service,Tigor,EV,Distilled Water,20,
314,Third Service,Tigor,EV,Shampoo,120,
315,Third Service,Tigor,EV,Coolant Top Up,212,
316,Third Service,Curvv,Petrol,Shampoo,120,
317,Third Service,Curvv,Petrol,Coolant Top Up,100,
318,Third Service,Curvv,Petrol,Engine Oil,2159.5,
319,Third Service,Curvv,Petrol,Oil Filter Change,,
320,Third Service,Curvv,Petrol,AC Filter,1027,
321,Third Service,Curvv,Petrol,Sunroof Greece,800,
322,Third Service,Curvv,Diesel,Distilled Water,20,
323,Third Service,Curvv,Diesel,Shampoo,120,
324,Third Service,Curvv,Diesel,Coolant Top Up,100,
325,Third Service,Curvv,Diesel,Engine Oil,3085,
326,Third Service,Curvv,Diesel,Oil Filter Change,212,
327,Third Service,Curvv,Diesel,AC Filter,1027,
328,Third Service,Curvv,Diesel,Sunroof Greece,800,
329,Third Service,Curvv,EV,Distilled Water,20,
330,Third Service,Curvv,EV,Shampoo,120,
331,Third Service,Curvv,EV,Coolant Top Up,212,
332,Third Service,Curvv,EV,Sunroof Greece,800,
333,Third Service,Harrier,Diesel,Distilled Water,20,
334,Third Service,Harrier,Diesel,Shampoo,120,
335,Third Service,Harrier,Diesel,Coolant Top Up,100,
336,Third Service,Harrier,Diesel,Engine Oil,5295,
337,Third Service,Harrier,Diesel,Oil Filter Change,792,
338,Third Service,Harrier,Diesel,Pollen Filter,1582,
339,Third Service,Harrier,Diesel,Sunroof Greece,800,
,Third Service,Harrier,Diesel,Balancing,600,
,Third Service,Harrier,Diesel,Diesel Filter,3000,
,Third Service,Harrier,Diesel,air Filter,1000,
,Third Service,Harrier,Diesel,Alignment,1200,
,Third Service,Harrier,Diesel,Def,620,
340,Third Service,Safari,Diesel,Distilled Water,20,
341,Third Service,Safari,Diesel,Shampoo,120,
342,Third Service,Safari,Diesel,Coolant Top Up,100,
343,Third Service,Safari,Diesel,Engine Oil,5295,
344,Third Service,Safari,Diesel,Oil Filter Change,792,
345,Third Service,Safari,Diesel,Pollen Filter,1581,
346,Third Service,Safari,Diesel,Sunroof Greece,800,
,Third Service,Safari,Diesel,Balancing,600,
,Third Service,Safari,Diesel,Diesel Filter,3000,
,Third Service,Safari,Diesel,air Filter,1000,
,Third Service,Safari,Diesel,Alignment,1200,
,Third Service,Safari,Diesel,Def,620,
347,Paid Service,Altroz,Petrol,Distilled Water,20,2160
348,Paid Service,Altroz,Petrol,Shampoo,120,2160
349,Paid Service,Altroz,Petrol,Oil Filter Change,179,2160
350,Paid Service,Altroz,Petrol,Gear Oil,832,2160
351,Paid Service,Altroz,Petrol,Air Filter,519,2160
352,Paid Service,Altroz,Petrol,AC Filter,347,2160
353,Paid Service,Altroz,Petrol,Alignment,750,2160
354,Paid Service,Altroz,Petrol,Balancing,580,2160
355,Paid Service,Altroz,Petrol,Engine Oil,2159.5,2160
356,Paid Service,Altroz,Petrol,Fuel Filter,443,2160
357,Paid Service,Altroz,Petrol,Break oil,224,2160
358,Paid Service,Altroz,Petrol,Sunroof Greece,800,2160
359,Paid Service,Altroz,Petrol,Service Kit,1467,2160
360,Paid Service,Altroz,Petrol,Spark Plug,540,2160
361,Paid Service,Altroz,Diesel,Distilled Water,20,2160
362,Paid Service,Altroz,Diesel,Shampoo,120,2160
363,Paid Service,Altroz,Diesel,Oil Filter Change,212,2160
364,Paid Service,Altroz,Diesel,Gear Oil,832,2160
365,Paid Service,Altroz,Diesel,Air Filter,406,2160
366,Paid Service,Altroz,Diesel,AC Filter,347,2160
367,Paid Service,Altroz,Diesel,Alignment,750,2160
368,Paid Service,Altroz,Diesel,Balancing,580,2160
369,Paid Service,Altroz,Diesel,Engine Oil,3085,2160
370,Paid Service,Altroz,Diesel,Fuel Filter,944,2160
371,Paid Service,Altroz,Diesel,Break oil,224,2160
372,Paid Service,Altroz,Diesel,Sunroof Greece,800,2160
373,Paid Service,Altroz,Diesel,Service Kit,1807,2160
374,Paid Service,Altroz,CNG,Distilled Water,20,2160
375,Paid Service,Altroz,CNG,Shampoo,120,2160
376,Paid Service,Altroz,CNG,Oil Filter Change,179,2160
377,Paid Service,Altroz,CNG,Gear Oil,832,2160
378,Paid Service,Altroz,CNG,Air Filter,861,2160
379,Paid Service,Altroz,CNG,AC Filter,347,2160
380,Paid Service,Altroz,CNG,Alignment,750,2160
381,Paid Service,Altroz,CNG,Balancing,580,2160
382,Paid Service,Altroz,CNG,Engine Oil,2159.5,2160
383,Paid Service,Altroz,CNG,Fuel Filter,443,2160
384,Paid Service,Altroz,CNG,Break oil,224,2160
385,Paid Service,Altroz,CNG,Sunroof Greece,800,2160
386,Paid Service,Altroz,CNG,Service Kit,1467,2160
387,Paid Service,Altroz,CNG,Spark Plug,540,2160
388,Paid Service,Tiago,Petrol,Distilled Water,20,2160
389,Paid Service,Tiago,Petrol,Shampoo,120,2160
390,Paid Service,Tiago,Petrol,Oil Filter Change,179,2160
391,Paid Service,Tiago,Petrol,Gear Oil,832,2160
392,Paid Service,Tiago,Petrol,Air Filter,509,2160
393,Paid Service,Tiago,Petrol,AC Filter,241,2160
394,Paid Service,Tiago,Petrol,Alignment,680,2160
395,Paid Service,Tiago,Petrol,Balancing,580,2160
396,Paid Service,Tiago,Petrol,Engine Oil,2159.5,2160
397,Paid Service,Tiago,Petrol,Fuel Filter,443,2160
398,Paid Service,Tiago,Petrol,Break oil,224,2160
399,Paid Service,Tiago,Petrol,Service Kit,1134,2160
400,Paid Service,Tiago,Petrol,Spark Plug,540,2160
401,Paid Service,Tiago,Petrol,Coolant Top Up,950,
402,Paid Service,Tiago,Diesel,Distilled Water,20,2160
403,Paid Service,Tiago,Diesel,Shampoo,120,2160
404,Paid Service,Tiago,Diesel,Oil Filter Change,212,2160
405,Paid Service,Tiago,Diesel,Gear Oil,832,2160
406,Paid Service,Tiago,Diesel,Air Filter,679,2160
407,Paid Service,Tiago,Diesel,AC Filter,241,2160
408,Paid Service,Tiago,Diesel,Alignment,680,2160
409,Paid Service,Tiago,Diesel,Balancing,580,2160
410,Paid Service,Tiago,Diesel,Engine Oil,3085,2160
411,Paid Service,Tiago,Diesel,Fuel Filter,944,2160
412,Paid Service,Tiago,Diesel,Break oil,224,2160
413,Paid Service,Tiago,Diesel,Service Kit,4253,2160
414,Paid Service,Tiago,CNG,Distilled Water,20,2160
415,Paid Service,Tiago,CNG,Shampoo,120,2160
416,Paid Service,Tiago,CNG,Oil Filter Change,179,2160
417,Paid Service,Tiago,CNG,Gear Oil,832,2160
418,Paid Service,Tiago,CNG,Air Filter,861,2160
419,Paid Service,Tiago,CNG,AC Filter,241,2160
420,Paid Service,Tiago,CNG,Alignment,680,2160
421,Paid Service,Tiago,CNG,Balancing,580,2160
422,Paid Service,Tiago,CNG,Engine Oil,2159.5,2160
423,Paid Service,Tiago,CNG,Fuel Filter,443,2160
424,Paid Service,Tiago,CNG,Break oil,224,2160
425,Paid Service,Tiago,CNG,Service Kit,1467,2160
426,Paid Service,Tiago,CNG,Spark Plug,540,2160
427,Paid Service,Tiago,EV,Distilled Water,20,2160
428,Paid Service,Tiago,EV,Shampoo,120,2160
429,Paid Service,Tiago,EV,Oil Filter Change,,2160
430,Paid Service,Tiago,EV,Gear Oil,1761,2160
431,Paid Service,Tiago,EV,Air Filter,861,2160
432,Paid Service,Tiago,EV,AC Filter,241,2160
433,Paid Service,Tiago,EV,Alignment,680,2160
434,Paid Service,Tiago,EV,Balancing,580,2160
435,Paid Service,Tiago,EV,Fuel Filter,,2160
436,Paid Service,Tiago,EV,Break oil,224,2160
437,Paid Service,Tiago,EV,Service Kit,,2160
438,Paid Service,Tiago,EV,Spark Plug,,2160
439,Paid Service,Nexon,Petrol,Distilled Water,20,2160
440,Paid Service,Nexon,Petrol,Shampoo,120,2160
441,Paid Service,Nexon,Petrol,Oil Filter Change,179,2160
442,Paid Service,Nexon,Petrol,Gear Oil,832,2160
443,Paid Service,Nexon,Petrol,Air Filter,527,2160
444,Paid Service,Nexon,Petrol,AC Filter,1027,2160
445,Paid Service,Nexon,Petrol,Alignment,680,2160
446,Paid Service,Nexon,Petrol,Balancing,580,2160
447,Paid Service,Nexon,Petrol,Engine Oil,2159.5,2160
448,Paid Service,Nexon,Petrol,Fuel Filter,443,2160
449,Paid Service,Nexon,Petrol,Break oil,224,2160
450,Paid Service,Nexon,Petrol,Sunroof Greece,800,2160
451,Paid Service,Nexon,Petrol,Service Kit,2600,2160
452,Paid Service,Nexon,Petrol,Spark Plug,1062,2160
453,Paid Service,Nexon,Petrol,Pollen Filter,1027,2160
454,Paid Service,Nexon,Petrol,Comby Filter,1027,2160
,Paid Service,Nexon,Petrol,Coolant ,1000,2160
455,Paid Service,Nexon,Diesel,Distilled Water,20,2160
456,Paid Service,Nexon,Diesel,Shampoo,120,2160
457,Paid Service,Nexon,Diesel,Oil Filter Change,212,2160
458,Paid Service,Nexon,Diesel,Gear Oil,832,2160
459,Paid Service,Nexon,Diesel,Air Filter,539,2160
460,Paid Service,Nexon,Diesel,AC Filter,1027,2160
461,Paid Service,Nexon,Diesel,Alignment,680,2160
462,Paid Service,Nexon,Diesel,Balancing,580,2160
463,Paid Service,Nexon,Diesel,Engine Oil,3085,2160
464,Paid Service,Nexon,Diesel,Fuel Filter,944,2160
465,Paid Service,Nexon,Diesel,Break oil,224,2160
466,Paid Service,Nexon,Diesel,Sunroof Greece,800,2160
467,Paid Service,Nexon,Diesel,Service Kit,2520,2160
468,Paid Service,Nexon,Diesel,Pollen Filter,1027,2160
469,Paid Service,Nexon,Diesel,Comby Filter,1027,2160
470,Paid Service,Nexon,CNG,Distilled Water,20,2160
471,Paid Service,Nexon,CNG,Shampoo,120,2160
472,Paid Service,Nexon,CNG,Oil Filter Change,179,2160
473,Paid Service,Nexon,CNG,Gear Oil,832,2160
474,Paid Service,Nexon,CNG,Air Filter,527,2160
475,Paid Service,Nexon,CNG,AC Filter,442,2160
476,Paid Service,Nexon,CNG,Alignment,680,2160
477,Paid Service,Nexon,CNG,Balancing,580,2160
478,Paid Service,Nexon,CNG,Engine Oil,2159.5,2160
479,Paid Service,Nexon,CNG,Fuel Filter,443,2160
480,Paid Service,Nexon,CNG,Break oil,224,2160
481,PaidService,Nexon,CNG,Sunroof Greece,800,2160
482,Paid Service,Nexon,CNG,Service Kit,2600,2160
483,Paid Service,Nexon,CNG,Spark Plug,1062,2160
484,Paid Service,Nexon,CNG,Pollen Filter,1027,2160
485,Paid Service,Nexon,CNG,Comby Filter,1027,2160
486,Paid Service,Nexon,EV,Distilled Water,20,2160
487,Paid Service,Nexon,EV,Shampoo,120,2160
488,Paid Service,Nexon,EV,Oil Filter Change,,2160
489,Paid Service,Nexon,EV,Gear Oil,1851,2160
490,Paid Service,Nexon,EV,Air Filter,527,2160
491,Paid Service,Nexon,EV,AC Filter,442,2160
492,Paid Service,Nexon,EV,Alignment,680,2160
493,Paid Service,Nexon,EV,Balancing,580,2160
494,Paid Service,Nexon,EV,Fuel Filter,,2160
495,Paid Service,Nexon,EV,Break oil,224,2160
496,Paid Service,Nexon,EV,Sunroof Greece,800,2160
497,Paid Service,Nexon,EV,Service Kit,,2160
498,Paid Service,Nexon,EV,Spark Plug,,2160
499,Paid Service,Nexon,EV,Pollen Filter,1027,2160
500,Paid Service,Nexon,EV,Comby Filter,1027,2160
501,Paid Service,Punch,Petrol,Distilled Water,20,2160
502,Paid Service,Punch,Petrol,Shampoo,120,2160
503,Paid Service,Punch,Petrol,Oil Filter Change,179,2160
504,Paid Service,Punch,Petrol,Gear Oil,832,2160
505,Paid Service,Punch,Petrol,Air Filter,509,2160
506,Paid Service,Punch,Petrol,AC Filter,241,2160
507,Paid Service,Punch,Petrol,Alignment,680,2160
508,Paid Service,Punch,Petrol,Balancing,580,2160
509,Paid Service,Punch,Petrol,Engine Oil,2159.5,2160
510,Paid Service,Punch,Petrol,Fuel Filter,443,2160
511,Paid Service,Punch,Petrol,Break oil,224,2160
512,Paid Service,Punch,Petrol,Sunroof Greece,800,2160
513,Paid Service,Punch,Petrol,Service Kit,1467,2160
514,Paid Service,Punch,Petrol,Spark Plug,540,2160
515,Paid Service,Punch,CNG,Distilled Water,20,2160
516,Paid Service,Punch,CNG,Shampoo,120,2160
517,Paid Service,Punch,CNG,Oil Filter Change,179,2160
518,Paid Service,Punch,CNG,Gear Oil,832,2160
519,Paid Service,Punch,CNG,Air Filter,861,2160
520,Paid Service,Punch,CNG,AC Filter,241,2160
521,Paid Service,Punch,CNG,Alignment,680,2160
522,Paid Service,Punch,CNG,Balancing,580,2160
523,Paid Service,Punch,CNG,Engine Oil,2159.5,2160
524,Paid Service,Punch,CNG,Fuel Filter,443,2160
525,Paid Service,Punch,CNG,Break oil,224,2160
526,Paid Service,Punch,CNG,Sunroof Greece,800,2160
527,Paid Service,Punch,CNG,Service Kit,1467,2160
528,Paid Service,Punch,CNG,Spark Plug,540,2160
529,Paid Service,Punch,EV,Distilled Water,20,2160
530,Paid Service,Punch,EV,Shampoo,120,2160
531,Paid Service,Punch,EV,Oil Filter Change,,2160
532,Paid Service,Punch,EV,Gear Oil,1762,2160
533,Paid Service,Punch,EV,Air Filter,861,2160
534,Paid Service,Punch,EV,AC Filter,241,2160
535,Paid Service,Punch,EV,Alignment,680,2160
536,Paid Service,Punch,EV,Balancing,580,2160
537,Paid Service,Punch,EV,Fuel Filter,,2160
538,Paid Service,Punch,EV,Break oil,224,2160
539,Paid Service,Punch,EV,Sunroof Greece,800,2160
540,Paid Service,Punch,EV,Service Kit,,2160
541,Paid Service,Punch,EV,Spark Plug,,2160
542,Paid Service,Tigor,Petrol,Distilled Water,20,2160
543,Paid Service,Tigor,Petrol,Shampoo,120,2160
544,Paid Service,Tigor,Petrol,Oil Filter Change,179,2160
545,Paid Service,Tigor,Petrol,Gear Oil,832,2160
546,Paid Service,Tigor,Petrol,Air Filter,509,2160
547,Paid Service,Tigor,Petrol,AC Filter,241,2160
548,Paid Service,Tigor,Petrol,Alignment,680,2160
549,Paid Service,Tigor,Petrol,Balancing,580,2160
550,Paid Service,Tigor,Petrol,Engine Oil,2159.5,2160
551,Paid Service,Tigor,Petrol,Fuel Filter,443,2160
552,Paid Service,Tigor,Petrol,Break oil,224,2160
553,Paid Service,Tigor,Petrol,Service Kit,1134,2160
554,Paid Service,Tigor,Petrol,Spark Plug,540,2160
555,Paid Service,Tigor,Diesel,Distilled Water,20,2160
556,Paid Service,Tigor,Diesel,Shampoo,120,2160
557,Paid Service,Tigor,Diesel,Oil Filter Change,212,2160
558,Paid Service,Tigor,Diesel,Gear Oil,832,2160
559,Paid Service,Tigor,Diesel,Air Filter,679,2160
560,Paid Service,Tigor,Diesel,AC Filter,241,2160
561,Paid Service,Tigor,Diesel,Alignment,680,2160
562,Paid Service,Tigor,Diesel,Balancing,580,2160
563,Paid Service,Tigor,Diesel,Engine Oil,3085,2160
564,Paid Service,Tigor,Diesel,Fuel Filter,944,2160
565,Paid Service,Tigor,Diesel,Break oil,224,2160
566,Paid Service,Tigor,Diesel,Service Kit,4253,2160
567,Paid Service,Tigor,CNG,Distilled Water,20,2160
568,Paid Service,Tigor,CNG,Shampoo,120,2160
569,Paid Service,Tigor,CNG,Oil Filter Change,179,2160
570,Paid Service,Tigor,CNG,Gear Oil,832,2160
571,Paid Service,Tigor,CNG,Air Filter,861,2160
572,Paid Service,Tigor,CNG,AC Filter,241,2160
573,Paid Service,Tigor,CNG,Alignment,680,2160
574,Paid Service,Tigor,CNG,Balancing,580,2160
575,Paid Service,Tigor,CNG,Engine Oil,2159.5,2160
576,Paid Service,Tigor,CNG,Fuel Filter,443,2160
577,Paid Service,Tigor,CNG,Break oil,224,2160
578,Paid Service,Tigor,CNG,Service Kit,1467,2160
579,Paid Service,Tigor,CNG,Spark Plug,540,2160
580,Paid Service,Tigor,EV,Distilled Water,20,2160
581,Paid Service,Tigor,EV,Shampoo,120,2160
582,Paid Service,Tigor,EV,Oil Filter Change,,2160
583,Paid Service,Tigor,EV,Gear Oil,1762,2160
584,Paid Service,Tigor,EV,Air Filter,861,2160
585,Paid Service,Tigor,EV,AC Filter,241,2160
586,Paid Service,Tigor,EV,Alignment,680,2160
587,Paid Service,Tigor,EV,Balancing,580,2160
588,Paid Service,Tigor,EV,Fuel Filter,,2160
589,Paid Service,Tigor,EV,Break oil,224,2160
590,Paid Service,Tigor,EV,Service Kit,,2160
591,Paid Service,Tigor,EV,Spark Plug,,2160
592,Paid Service,Curvv,Petrol,Distilled Water,20,1510
593,Paid Service,Curvv,Petrol,Shampoo,120,1510
594,Paid Service,Curvv,Petrol,Oil Filter Change,179,1510
595,Paid Service,Curvv,Petrol,Gear Oil,832,1510
596,Paid Service,Curvv,Petrol,Air Filter,527,1510
597,Paid Service,Curvv,Petrol,AC Filter,1027,1510
598,Paid Service,Curvv,Petrol,Alignment,750,1510
599,Paid Service,Curvv,Petrol,Balancing,,1510
600,Paid Service,Curvv,Petrol,Engine Oil,2159.5,1510
601,Paid Service,Curvv,Petrol,Fuel Filter,443,1510
602,Paid Service,Curvv,Petrol,Break oil,224,1510
603,Paid Service,Curvv,Petrol,Sunroof Greece,800,1510
604,Paid Service,Curvv,Petrol,Service Kit,2600,1510
605,Paid Service,Curvv,Petrol,Spark Plug,,1510
606,Paid Service,Curvv,Petrol,Pollen Filter,,1510
607,Paid Service,Curvv,Petrol,Comby Filter,1027,1510
608,Paid Service,Curvv,Diesel,Distilled Water,20,1510
609,Paid Service,Curvv,Diesel,Shampoo,120,1510
610,Paid Service,Curvv,Diesel,Oil Filter Change,212,1510
611,Paid Service,Curvv,Diesel,Gear Oil,832,1510
612,Paid Service,Curvv,Diesel,Air Filter,539,1510
613,Paid Service,Curvv,Diesel,AC Filter,1027,1510
614,Paid Service,Curvv,Diesel,Alignment,750,1510
615,Paid Service,Curvv,Diesel,Balancing,,1510
616,Paid Service,Curvv,Diesel,Engine Oil,3085,1510
617,Paid Service,Curvv,Diesel,Fuel Filter,944,1510
618,Paid Service,Curvv,Diesel,Break oil,224,1510
619,Paid Service,Curvv,Diesel,Sunroof Greece,800,1510
620,Paid Service,Curvv,Diesel,Service Kit,2520,1510
621,Paid Service,Curvv,Diesel,Pollen Filter,,1510
622,Paid Service,Curvv,Diesel,Comby Filter,1027,1510
623,Paid Service,Curvv,EV,Distilled Water,20,2335
624,Paid Service,Curvv,EV,Shampoo,120,2335
625,Paid Service,Curvv,EV,Oil Filter Change,,2335
626,Paid Service,Curvv,EV,Gear Oil,1762,2335
627,Paid Service,Curvv,EV,Air Filter,539,2335
628,Paid Service,Curvv,EV,AC Filter,1027,2335
629,Paid Service,Curvv,EV,Alignment,750,2335
630,Paid Service,Curvv,EV,Balancing,,2335
631,Paid Service,Curvv,EV,Fuel Filter,,2335
632,Paid Service,Curvv,EV,Break oil,224,2335
633,Paid Service,Curvv,EV,Sunroof Greece,800,2335
634,Paid Service,Curvv,EV,Service Kit,,2335
635,Paid Service,Curvv,EV,Spark Plug,,2335
636,Paid Service,Curvv,EV,Pollen Filter,,2335
637,Paid Service,Curvv,EV,Comby Filter,1027,2335
638,Paid Service,Harrier,Diesel,Balancing,600,3960
639,Paid Service,Harrier,Diesel,Shampoo,120,3960
640,Paid Service,Harrier,Diesel,Oil Filter Change,792,3960
641,Paid Service,Harrier,Diesel,Gear Oil,3715,3960
642,Paid Service,Harrier,Diesel,Air Filter,906,3960
643,Paid Service,Harrier,Diesel,Alignment,1328,3960
644,Paid Service,Harrier,Diesel,Balancing,580,3960
645,Paid Service,Harrier,Diesel,Engine Oil,5295,3960
646,Paid Service,Harrier,Diesel,Fuel Filter,2654,3960
647,Paid Service,Harrier,Diesel,Break oil,224,3960
648,Paid Service,Harrier,Diesel,Sunroof Greece,800,3960
649,Paid Service,Harrier,Diesel,Service Kit,5532,3960
650,Paid Service,Harrier,Diesel,Pollen Filter,1581,3960
651,Paid Service,Harrier,Diesel,Comby Filter,1581,3960
,Paid Service,Harrier,Diesel,Def,620,3960
652,Paid Service,Safari,Diesel,Distilled Water,20,3983
653,Paid Service,Safari,Diesel,Shampoo,120,3983
654,Paid Service,Safari,Diesel,Oil Filter Change,792,3983
655,Paid Service,Safari,Diesel,Gear Oil,3715,3983
656,Paid Service,Safari,Diesel,Air Filter,906,3983
657,Paid Service,Safari,Diesel,Alignment,1328,3983
658,Paid Service,Safari,Diesel,Balancing,580,3983
659,Paid Service,Safari,Diesel,Engine Oil,5295,3983
660,Paid Service,Safari,Diesel,Fuel Filter,2654,3983
661,Paid Service,Safari,Diesel,Break oil,224,3983
662,Paid Service,Safari,Diesel,Sunroof Greece,800,3983
663,Paid Service,Safari,Diesel,Service Kit,5532,3983
664,Paid Service,Safari,Diesel,Pollen Filter,1581,3983
665,Paid Service,Safari,Diesel,Comby Filter,1581,3983
,Paid Service,Safari,Diesel,Def,620,3983
666,Campaign,Altroz,Petrol,,,
667,Campaign,Altroz,Diesel,,,
668,Campaign,Altroz,CNG,,,
669,Campaign,Tiago,Petrol,,,
670,Campaign,Tiago,Diesel,,,
671,Campaign,Tiago,CNG,,,
672,Campaign,Tiago,EV,,,
673,Campaign,Nexon,Petrol,,,
674,Campaign,Nexon,Diesel,,,
675,Campaign,Nexon,CNG,,,
676,Campaign,Nexon,EV,,,
677,Campaign,Punch,Petrol,,,
678,Campaign,Punch,CNG,,,
679,Campaign,Punch,EV,,,
680,Campaign,Tigor,Petrol,,,
681,Campaign,Tigor,Diesel,,,
682,Campaign,Tigor,CNG,,,
683,Campaign,Tigor,EV,,,
684,Campaign,Curvv,Petrol,,,
685,Campaign,Curvv,Diesel,,,
686,Campaign,Curvv,EV,,,
687,Campaign,Harrier,Diesel,,,
688,Campaign,Safari,Diesel,,,
689,E Breakdown,Altroz,Petrol,,,
690,E Breakdown,Altroz,Diesel,,,
691,E Breakdown,Altroz,CNG,,,
692,E Breakdown,Tiago,Petrol,,,
693,E Breakdown,Tiago,Diesel,,,
694,E Breakdown,Tiago,CNG,,,
695,E Breakdown,Tiago,EV,,,
696,E Breakdown,Nexon,Petrol,,,
697,E Breakdown,Nexon,Diesel,,,
698,E Breakdown,Nexon,CNG,,,
699,E Breakdown,Nexon,EV,,,
700,E Breakdown,Punch,Petrol,,,
701,E Breakdown,Punch,CNG,,,
702,E Breakdown,Punch,EV,,,
703,E Breakdown,Tigor,Petrol,,,
704,E Breakdown,Tigor,Diesel,,,
705,E Breakdown,Tigor,CNG,,,
706,E Breakdown,Tigor,EV,,,
707,E Breakdown,Curvv,Petrol,,,
708,E Breakdown,Curvv,Diesel,,,
709,E Breakdown,Curvv,EV,,,
710,E Breakdown,Harrier,Diesel,,,
711,E Breakdown,Safari,Diesel,,,
712,Running Repairs,Altroz,Petrol,Tyre Issue,,
713,Running Repairs,Altroz,Petrol,Battery Issue,,
714,Running Repairs,Altroz,Petrol,Updation,,
715,Running Repairs,Altroz,Diesel,Tyre Issue,,
716,Running Repairs,Altroz,Diesel,Battery Issue,,
717,Running Repairs,Altroz,Diesel,Updation,,
718,Running Repairs,Altroz,CNG,Tyre Issue,,
719,Running Repairs,Altroz,CNG,Battery Issue,,
720,Running Repairs,Altroz,CNG,Updation,,
721,Running Repairs,Tiago,Petrol,Tyre Issue,,
722,Running Repairs,Tiago,Petrol,Battery Issue,,
723,Running Repairs,Tiago,Petrol,Updation,,
724,Running Repairs,Tiago,Diesel,Tyre Issue,,
725,Running Repairs,Tiago,Diesel,Battery Issue,,
726,Running Repairs,Tiago,Diesel,Updation,,
727,Running Repairs,Tiago,CNG,Tyre Issue,,
728,Running Repairs,Tiago,CNG,Battery Issue,,
729,Running Repairs,Tiago,CNG,Updation,,
730,Running Repairs,Tiago,EV,Tyre Issue,,
731,Running Repairs,Tiago,EV,Battery Issue,,
732,Running Repairs,Tiago,EV,Updation,,
733,Running Repairs,Nexon,Petrol,Tyre Issue,,
734,Running Repairs,Nexon,Petrol,Battery Issue,,
735,Running Repairs,Nexon,Petrol,Updation,,
736,Running Repairs,Nexon,Diesel,Tyre Issue,,
737,Running Repairs,Nexon,Diesel,Battery Issue,,
738,Running Repairs,Nexon,Diesel,Updation,,
739,Running Repairs,Nexon,CNG,Tyre Issue,,
740,Running Repairs,Nexon,CNG,Battery Issue,,
741,Running Repairs,Nexon,CNG,Updation,,
742,Running Repairs,Nexon,EV,Tyre Issue,,
743,Running Repairs,Nexon,EV,Battery Issue,,
744,Running Repairs,Nexon,EV,Updation,,
745,Running Repairs,Punch,Petrol,Tyre Issue,,
746,Running Repairs,Punch,Petrol,Battery Issue,,
747,Running Repairs,Punch,Petrol,Updation,,
748,Running Repairs,Punch,CNG,Tyre Issue,,
749,Running Repairs,Punch,CNG,Battery Issue,,
750,Running Repairs,Punch,CNG,Updation,,
751,Running Repairs,Punch,EV,Tyre Issue,,
752,Running Repairs,Punch,EV,Battery Issue,,
753,Running Repairs,Punch,EV,Updation,,
754,Running Repairs,Tigor,Petrol,Tyre Issue,,
755,Running Repairs,Tigor,Petrol,Battery Issue,,
756,Running Repairs,Tigor,Petrol,Updation,,
757,Running Repairs,Tigor,Diesel,Tyre Issue,,
758,Running Repairs,Tigor,Diesel,Battery Issue,,
759,Running Repairs,Tigor,Diesel,Updation,,
760,Running Repairs,Tigor,CNG,Tyre Issue,,
761,Running Repairs,Tigor,CNG,Battery Issue,,
762,Running Repairs,Tigor,CNG,Updation,,
763,Running Repairs,Tigor,EV,Tyre Issue,,
764,Running Repairs,Tigor,EV,Battery Issue,,
765,Running Repairs,Tigor,EV,Updation,,
766,Running Repairs,Curvv,Petrol,Tyre Issue,,
767,Running Repairs,Curvv,Petrol,Battery Issue,,
768,Running Repairs,Curvv,Petrol,Updation,,
769,Running Repairs,Curvv,Diesel,Tyre Issue,,
770,Running Repairs,Curvv,Diesel,Battery Issue,,
771,Running Repairs,Curvv,Diesel,Updation,,
772,Running Repairs,Curvv,EV,Tyre Issue,,
773,Running Repairs,Curvv,EV,Battery Issue,,
774,Running Repairs,Curvv,EV,Updation,,
775,Running Repairs,Harrier,Diesel,Tyre Issue,,
776,Running Repairs,Harrier,Diesel,Def Refill,,
777,Running Repairs,Harrier,Diesel,Battery Issue,,
778,Running Repairs,Harrier,Diesel,Updation,,
779,Running Repairs,Safari,Diesel,Tyre Issue,,
780,Running Repairs,Safari,Diesel,Def Refill,,
781,Running Repairs,Safari,Diesel,Battery Issue,,
782,Running Repairs,Safari,Diesel,Updation,,
783,Mini Paid Service,Altroz,Petrol,Distilled Water,20,1080
784,Mini Paid Service,Altroz,Petrol,Shampoo,120,1080
785,Mini Paid Service,Altroz,Petrol,Coolant Top Up,100,1080
786,Mini Paid Service,Altroz,Petrol,Oil Filter Change,179,1080
787,Mini Paid Service,Altroz,Petrol,Sunroof Greece,800,1080
788,Mini Paid Service,Altroz,Diesel,Distilled Water,20,1080
789,Mini Paid Service,Altroz,Diesel,Shampoo,120,1080
790,Mini Paid Service,Altroz,Diesel,Coolant Top Up,100,1080
791,Mini Paid Service,Altroz,Diesel,Oil Filter Change,212,1080
792,Mini Paid Service,Altroz,Diesel,Sunroof Greece,800,1080
793,Mini Paid Service,Altroz,CNG,Distilled Water,20,1080
794,Mini Paid Service,Altroz,CNG,Shampoo,120,1080
795,Mini Paid Service,Altroz,CNG,Coolant Top Up,100,1080
796,Mini Paid Service,Altroz,CNG,Oil Filter Change,179,1080
797,Mini Paid Service,Altroz,CNG,Sunroof Greece,800,1080
798,Mini Paid Service,Tiago,Petrol,Distilled Water,20,1080
799,Mini Paid Service,Tiago,Petrol,Shampoo,120,1080
800,Mini Paid Service,Tiago,Petrol,Coolant Top Up,100,1080
801,Mini Paid Service,Tiago,Petrol,Oil Filter Change,179,1080
802,Mini Paid Service,Tiago,Diesel,Distilled Water,20,1080
803,Mini Paid Service,Tiago,Diesel,Shampoo,120,1080
804,Mini Paid Service,Tiago,Diesel,Coolant Top Up,100,1080
805,Mini Paid Service,Tiago,Diesel,Oil Filter Change,212,1080
806,Mini Paid Service,Tiago,CNG,Distilled Water,20,1080
807,Mini Paid Service,Tiago,CNG,Shampoo,120,1080
808,Mini Paid Service,Tiago,CNG,Coolant Top Up,100,1080
809,Mini Paid Service,Tiago,CNG,Oil Filter Change,179,1080
810,Mini Paid Service,Tiago,EV,Distilled Water,20,1080
811,Mini Paid Service,Tiago,EV,Shampoo,120,1080
812,Mini Paid Service,Tiago,EV,Coolant Top Up,212,1080
813,Mini Paid Service,Nexon,Petrol,Distilled Water,20,1080
814,Mini Paid Service,Nexon,Petrol,Shampoo,120,1080
815,Mini Paid Service,Nexon,Petrol,Coolant Top Up,100,1080
816,Mini Paid Service,Nexon,Petrol,Oil Filter Change,179,1080
,Mini Paid Service,Nexon,Petrol,Alignment,750,1080
,Mini Paid Service,Nexon,Petrol,Balancing,500,1080
817,Mini Paid Service,Nexon,Petrol,Sunroof Greece,800,1080
818,Mini Paid Service,Nexon,Diesel,Distilled Water,20,1080
819,Mini Paid Service,Nexon,Diesel,Shampoo,120,1080
820,Mini Paid Service,Nexon,Diesel,Coolant Top Up,100,1080
821,Mini Paid Service,Nexon,Diesel,Oil Filter Change,212,1080
822,Mini Paid Service,Nexon,Diesel,Sunroof Greece,800,1080
,Mini Paid Service,Nexon,Petrol,Alignment,750,1080
,Mini Paid Service,Nexon,Petrol,Balancing,500,1080
823,Mini Paid Service,Nexon,CNG,Distilled Water,20,1080
824,Mini Paid Service,Nexon,CNG,Shampoo,120,1080
825,Mini Paid Service,Nexon,CNG,Coolant Top Up,100,1080
826,Mini Paid Service,Nexon,CNG,Oil Filter Change,179,1080
827,Mini Paid Service,Nexon,CNG,Sunroof Greece,800,1080
828,Mini Paid Service,Nexon,EV,Distilled Water,20,1080
829,Mini Paid Service,Nexon,EV,Shampoo,120,1080
830,Mini Paid Service,Nexon,EV,Coolant Top Up,212,1080
831,Mini Paid Service,Nexon,EV,Sunroof Greece,800,1080
832,Mini Paid Service,Punch,Petrol,Distilled Water,20,1080
833,Mini Paid Service,Punch,Petrol,Shampoo,120,1080
834,Mini Paid Service,Punch,Petrol,Coolant Top Up,100,1080
835,Mini Paid Service,Punch,Petrol,Oil Filter Change,179,1080
836,Mini Paid Service,Punch,Petrol,Sunroof Greece,800,1080
837,Mini Paid Service,Punch,CNG,Distilled Water,20,1080
838,Mini Paid Service,Punch,CNG,Shampoo,120,1080
839,Mini Paid Service,Punch,CNG,Coolant Top Up,100,1080
840,Mini Paid Service,Punch,CNG,Oil Filter Change,179,1080
841,Mini Paid Service,Punch,CNG,Sunroof Greece,800,1080
842,Mini Paid Service,Punch,EV,Distilled Water,20,1080
843,Mini Paid Service,Punch,EV,Shampoo,120,1080
844,Mini Paid Service,Punch,EV,Coolant Top Up,212,1080
845,Mini Paid Service,Punch,EV,Sunroof Greece,800,1080
846,Mini Paid Service,Tigor,Petrol,Distilled Water,20,1080
847,Mini Paid Service,Tigor,Petrol,Shampoo,120,1080
848,Mini Paid Service,Tigor,Petrol,Coolant Top Up,100,1080
849,Mini Paid Service,Tigor,Petrol,Oil Filter Change,179,1080
850,Mini Paid Service,Tigor,Diesel,Distilled Water,20,1080
851,Mini Paid Service,Tigor,Diesel,Shampoo,120,1080
852,Mini Paid Service,Tigor,Diesel,Coolant Top Up,100,1080
853,Mini Paid Service,Tigor,Diesel,Oil Filter Change,212,1080
854,Mini Paid Service,Tigor,CNG,Distilled Water,20,1080
855,Mini Paid Service,Tigor,CNG,Shampoo,120,1080
856,Mini Paid Service,Tigor,CNG,Coolant Top Up,100,1080
857,Mini Paid Service,Tigor,CNG,Oil Filter Change,179,1080
858,Mini Paid Service,Tigor,EV,Distilled Water,20,1080
859,Mini Paid Service,Tigor,EV,Shampoo,120,1080
860,Mini Paid Service,Tigor,EV,Coolant Top Up,212,1080
861,Mini Paid Service,Curvv,Petrol,Shampoo,120,755
862,Mini Paid Service,Curvv,Petrol,Coolant Top Up,100,755
863,Mini Paid Service,Curvv,Petrol,Oil Filter Change,179,755
864,Mini Paid Service,Curvv,Petrol,Sunroof Greece,800,755
865,Mini Paid Service,Curvv,Diesel,Distilled Water,20,755
866,Mini Paid Service,Curvv,Diesel,Shampoo,120,755
867,Mini Paid Service,Curvv,Diesel,Coolant Top Up,100,755
868,Mini Paid Service,Curvv,Diesel,Oil Filter Change,212,755
869,Mini Paid Service,Curvv,Diesel,Sunroof Greece,800,755
870,Mini Paid Service,Curvv,EV,Distilled Water,20,1168
871,Mini Paid Service,Curvv,EV,Shampoo,120,1168
872,Mini Paid Service,Curvv,EV,Coolant Top Up,212,1168
873,Mini Paid Service,Curvv,EV,Sunroof Greece,800,1168
874,Mini Paid Service,Harrier,Diesel,Distilled Water,20,1250
875,Mini Paid Service,Harrier,Diesel,Shampoo,120,1250
876,Mini Paid Service,Harrier,Diesel,Coolant Top Up,100,1250
877,Mini Paid Service,Harrier,Diesel,Oil Filter Change,792,1250
878,Mini Paid Service,Harrier,Diesel,Sunroof Greece,800,1250
879,Mini Paid Service,Safari,Diesel,Distilled Water,20,1250
880,Mini Paid Service,Safari,Diesel,Shampoo,120,1250
881,Mini Paid Service,Safari,Diesel,Coolant Top Up,100,1250
882,Mini Paid Service,Safari,Diesel,Oil Filter Change,792,1250
883,Mini Paid Service,Safari,Diesel,Sunroof Greece,800,1250
,Mini Paid Service,Safari,Diesel,oil Top up,650,1250`

function parseCsv(csv) {
  const lines = csv.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  const header = lines[0].split(',')
  const rows = []
  let autoId = 1

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.replace(/,/g, '').trim()) continue
    const parts = line.split(',')
    const rawId = parts[0]?.trim()
    const serviceType = parts[1]?.trim() || ''
    const model = parts[2]?.trim() || ''
    const fuel = parts[3]?.trim() || ''
    const serviceName = parts[4]?.trim() || ''
    const rawPrice = parts[5]?.trim()
    const rawLabour = parts[6]?.trim()

    if (!serviceType && !model && !serviceName) continue

    const price = rawPrice && !isNaN(Number(rawPrice)) ? Number(rawPrice) : 0
    const labour = rawLabour && !isNaN(Number(rawLabour)) ? Number(rawLabour) : 0
    const rowId = rawId && !isNaN(Number(rawId)) ? Number(rawId) : autoId

    rows.push({
      id: rowId,
      service_type: serviceType,
      model: model,
      fuel: fuel,
      service_name: serviceName,
      price: price,
      labour: labour,
    })
    autoId++
  }

  return rows
}

const rows = parseCsv(rawCsv)
console.log(`Parsed ${rows.length} valid rows from CSV!`)

// 1. Write JSON files
const jsonContent = JSON.stringify(rows, null, 2)
fs.writeFileSync('src/data/parts_pricing.json', jsonContent, 'utf8')
fs.writeFileSync('bodyshop/src/data/parts_pricing.json', jsonContent, 'utf8')
console.log('Saved src/data/parts_pricing.json and bodyshop/src/data/parts_pricing.json')

// 2. Generate SQL Migration
let sql = `-- Migration: 20260912120000_create_service_parts_pricing.sql
-- Create table for Dealership parts & services pricing
CREATE TABLE IF NOT EXISTS public.service_parts_pricing (
    id BIGSERIAL PRIMARY KEY,
    service_type TEXT NOT NULL,
    model TEXT NOT NULL,
    fuel TEXT NOT NULL,
    service_name TEXT NOT NULL,
    price NUMERIC(10,2) DEFAULT 0,
    labour NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup by model, service_type, and fuel
CREATE INDEX IF NOT EXISTS idx_parts_pricing_lookup ON public.service_parts_pricing (model, service_type, fuel);

-- Enable RLS & public read access
ALTER TABLE public.service_parts_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to all" ON public.service_parts_pricing FOR SELECT USING (true);
CREATE POLICY "Allow all access to service_role" ON public.service_parts_pricing USING (true) WITH CHECK (true);

-- Populate Data
INSERT INTO public.service_parts_pricing (id, service_type, model, fuel, service_name, price, labour) VALUES
`

const valuesSql = rows.map(r => {
  const sType = r.service_type.replace(/'/g, "''")
  const sModel = r.model.replace(/'/g, "''")
  const sFuel = r.fuel.replace(/'/g, "''")
  const sName = r.service_name.replace(/'/g, "''")
  return `(${r.id}, '${sType}', '${sModel}', '${sFuel}', '${sName}', ${r.price}, ${r.labour})`
}).join(',\n')

sql += valuesSql + '\nON CONFLICT (id) DO UPDATE SET service_type=EXCLUDED.service_type, model=EXCLUDED.model, fuel=EXCLUDED.fuel, service_name=EXCLUDED.service_name, price=EXCLUDED.price, labour=EXCLUDED.labour;\n'

fs.writeFileSync('supabase/migrations/20260912120000_create_service_parts_pricing.sql', sql, 'utf8')
console.log('Saved supabase/migrations/20260912120000_create_service_parts_pricing.sql')
