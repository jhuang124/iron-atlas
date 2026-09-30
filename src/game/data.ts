// Classic North America map and 30-ticket deck (2004–2015 rules edition).
// Map coordinates and all artwork are original to Iron Atlas. See docs/RULES.md.
export const COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'black', 'white', 'wild'] as const;

export type CardColor = (typeof COLORS)[number];
export type RouteColor = Exclude<CardColor, 'wild'> | 'gray';

export interface City {
  id: string;
  name: string;
  x: number;
  y: number;
  labelDx?: number;
  labelDy?: number;
}

export interface Route {
  id: string;
  from: string;
  to: string;
  length: number;
  color: RouteColor;
  parallelGroup?: string;
}

export interface Ticket {
  id: string;
  from: string;
  to: string;
  points: number;
}

export const SCORE_BY_LENGTH = [0, 1, 2, 4, 7, 10, 15] as const;

export const CITIES: City[] = [
  { id: 'vancouver', name: 'Vancouver', x: 115, y: 80, labelDx: -17, labelDy: -16 },
  { id: 'calgary', name: 'Calgary', x: 235, y: 70, labelDx: -17, labelDy: -16 },
  { id: 'winnipeg', name: 'Winnipeg', x: 475, y: 82, labelDx: -10, labelDy: -16 },
  { id: 'montreal', name: 'Montréal', x: 865, y: 78, labelDx: -10, labelDy: -16 },
  { id: 'boston', name: 'Boston', x: 945, y: 155, labelDx: 10, labelDy: -8 },
  { id: 'seattle', name: 'Seattle', x: 100, y: 132, labelDx: -58, labelDy: 4 },
  { id: 'portland', name: 'Portland', x: 80, y: 202, labelDx: -59, labelDy: 4 },
  { id: 'helena', name: 'Helena', x: 350, y: 215, labelDx: -20, labelDy: -17 },
  { id: 'duluth', name: 'Duluth', x: 575, y: 210, labelDx: -16, labelDy: -17 },
  { id: 'sault-ste-marie', name: 'Sault Ste. Marie', x: 710, y: 140, labelDx: -49, labelDy: -17 },
  { id: 'toronto', name: 'Toronto', x: 800, y: 215, labelDx: 11, labelDy: 1 },
  { id: 'new-york', name: 'New York', x: 895, y: 250, labelDx: 12, labelDy: 0 },
  { id: 'san-francisco', name: 'San Francisco', x: 75, y: 350, labelDx: -37, labelDy: -17 },
  { id: 'salt-lake-city', name: 'Salt Lake City', x: 255, y: 340, labelDx: -42, labelDy: -18 },
  { id: 'denver', name: 'Denver', x: 390, y: 355, labelDx: -18, labelDy: -16 },
  { id: 'omaha', name: 'Omaha', x: 500, y: 300, labelDx: -17, labelDy: -17 },
  { id: 'kansas-city', name: 'Kansas City', x: 545, y: 375, labelDx: -45, labelDy: 22 },
  { id: 'st-louis', name: 'St. Louis', x: 650, y: 375, labelDx: -25, labelDy: 23 },
  { id: 'chicago', name: 'Chicago', x: 695, y: 300, labelDx: -19, labelDy: -17 },
  { id: 'pittsburgh', name: 'Pittsburgh', x: 805, y: 300, labelDx: -28, labelDy: -17 },
  { id: 'washington', name: 'Washington', x: 875, y: 335, labelDx: 12, labelDy: 6 },
  { id: 'raleigh', name: 'Raleigh', x: 840, y: 420, labelDx: 11, labelDy: 0 },
  { id: 'nashville', name: 'Nashville', x: 725, y: 430, labelDx: -26, labelDy: -17 },
  { id: 'atlanta', name: 'Atlanta', x: 760, y: 490, labelDx: -21, labelDy: 22 },
  { id: 'charleston', name: 'Charleston', x: 875, y: 470, labelDx: 12, labelDy: -5 },
  { id: 'miami', name: 'Miami', x: 920, y: 585, labelDx: 12, labelDy: 4 },
  { id: 'new-orleans', name: 'New Orleans', x: 670, y: 565, labelDx: -37, labelDy: 25 },
  { id: 'houston', name: 'Houston', x: 560, y: 560, labelDx: -26, labelDy: 25 },
  { id: 'dallas', name: 'Dallas', x: 520, y: 510, labelDx: -43, labelDy: 4 },
  { id: 'oklahoma-city', name: 'Oklahoma City', x: 500, y: 440, labelDx: -61, labelDy: -16 },
  { id: 'little-rock', name: 'Little Rock', x: 620, y: 465, labelDx: -27, labelDy: -17 },
  { id: 'santa-fe', name: 'Santa Fe', x: 400, y: 450, labelDx: -20, labelDy: -17 },
  { id: 'el-paso', name: 'El Paso', x: 350, y: 545, labelDx: -24, labelDy: 24 },
  { id: 'phoenix', name: 'Phoenix', x: 255, y: 480, labelDx: -23, labelDy: -17 },
  { id: 'las-vegas', name: 'Las Vegas', x: 185, y: 425, labelDx: -44, labelDy: -17 },
  { id: 'los-angeles', name: 'Los Angeles', x: 145, y: 470, labelDx: -67, labelDy: 24 },
];

// Each lane is a separate edge. Shared parallelGroup controls double-route rules.
export const ROUTES: Route[] = [
  { id: 'vancouver-calgary', from: 'vancouver', to: 'calgary', length: 3, color: 'gray' },
  { id: 'vancouver-seattle-1', from: 'vancouver', to: 'seattle', length: 1, color: 'gray', parallelGroup: 'vancouver-seattle' },
  { id: 'vancouver-seattle-2', from: 'vancouver', to: 'seattle', length: 1, color: 'gray', parallelGroup: 'vancouver-seattle' },
  { id: 'calgary-seattle', from: 'calgary', to: 'seattle', length: 4, color: 'gray' },
  { id: 'calgary-helena', from: 'calgary', to: 'helena', length: 4, color: 'gray' },
  { id: 'calgary-winnipeg', from: 'calgary', to: 'winnipeg', length: 6, color: 'white' },
  { id: 'seattle-portland-1', from: 'seattle', to: 'portland', length: 1, color: 'gray', parallelGroup: 'seattle-portland' },
  { id: 'seattle-portland-2', from: 'seattle', to: 'portland', length: 1, color: 'gray', parallelGroup: 'seattle-portland' },
  { id: 'seattle-helena', from: 'seattle', to: 'helena', length: 6, color: 'yellow' },
  { id: 'portland-san-francisco-1', from: 'portland', to: 'san-francisco', length: 5, color: 'green', parallelGroup: 'portland-san-francisco' },
  { id: 'portland-san-francisco-2', from: 'portland', to: 'san-francisco', length: 5, color: 'purple', parallelGroup: 'portland-san-francisco' },
  { id: 'portland-salt-lake-city', from: 'portland', to: 'salt-lake-city', length: 6, color: 'blue' },
  { id: 'san-francisco-salt-lake-city-1', from: 'san-francisco', to: 'salt-lake-city', length: 5, color: 'orange', parallelGroup: 'san-francisco-salt-lake-city' },
  { id: 'san-francisco-salt-lake-city-2', from: 'san-francisco', to: 'salt-lake-city', length: 5, color: 'white', parallelGroup: 'san-francisco-salt-lake-city' },
  { id: 'san-francisco-los-angeles-1', from: 'san-francisco', to: 'los-angeles', length: 3, color: 'yellow', parallelGroup: 'san-francisco-los-angeles' },
  { id: 'san-francisco-los-angeles-2', from: 'san-francisco', to: 'los-angeles', length: 3, color: 'purple', parallelGroup: 'san-francisco-los-angeles' },
  { id: 'los-angeles-las-vegas', from: 'los-angeles', to: 'las-vegas', length: 2, color: 'gray' },
  { id: 'los-angeles-phoenix', from: 'los-angeles', to: 'phoenix', length: 3, color: 'gray' },
  { id: 'los-angeles-el-paso', from: 'los-angeles', to: 'el-paso', length: 6, color: 'black' },
  { id: 'las-vegas-salt-lake-city', from: 'las-vegas', to: 'salt-lake-city', length: 3, color: 'orange' },
  { id: 'phoenix-santa-fe', from: 'phoenix', to: 'santa-fe', length: 3, color: 'gray' },
  { id: 'phoenix-el-paso', from: 'phoenix', to: 'el-paso', length: 3, color: 'gray' },
  { id: 'phoenix-denver', from: 'phoenix', to: 'denver', length: 5, color: 'white' },
  { id: 'salt-lake-city-helena', from: 'salt-lake-city', to: 'helena', length: 3, color: 'purple' },
  { id: 'salt-lake-city-denver-1', from: 'salt-lake-city', to: 'denver', length: 3, color: 'red', parallelGroup: 'salt-lake-city-denver' },
  { id: 'salt-lake-city-denver-2', from: 'salt-lake-city', to: 'denver', length: 3, color: 'yellow', parallelGroup: 'salt-lake-city-denver' },
  { id: 'helena-winnipeg', from: 'helena', to: 'winnipeg', length: 4, color: 'blue' },
  { id: 'helena-duluth', from: 'helena', to: 'duluth', length: 6, color: 'orange' },
  { id: 'helena-omaha', from: 'helena', to: 'omaha', length: 5, color: 'red' },
  { id: 'helena-denver', from: 'helena', to: 'denver', length: 4, color: 'green' },
  { id: 'denver-santa-fe', from: 'denver', to: 'santa-fe', length: 2, color: 'gray' },
  { id: 'denver-oklahoma-city', from: 'denver', to: 'oklahoma-city', length: 4, color: 'red' },
  { id: 'denver-kansas-city-1', from: 'denver', to: 'kansas-city', length: 4, color: 'black', parallelGroup: 'denver-kansas-city' },
  { id: 'denver-kansas-city-2', from: 'denver', to: 'kansas-city', length: 4, color: 'orange', parallelGroup: 'denver-kansas-city' },
  { id: 'denver-omaha', from: 'denver', to: 'omaha', length: 4, color: 'purple' },
  { id: 'santa-fe-el-paso', from: 'santa-fe', to: 'el-paso', length: 2, color: 'gray' },
  { id: 'santa-fe-oklahoma-city', from: 'santa-fe', to: 'oklahoma-city', length: 3, color: 'blue' },
  { id: 'el-paso-oklahoma-city', from: 'el-paso', to: 'oklahoma-city', length: 5, color: 'yellow' },
  { id: 'el-paso-dallas', from: 'el-paso', to: 'dallas', length: 4, color: 'red' },
  { id: 'el-paso-houston', from: 'el-paso', to: 'houston', length: 6, color: 'green' },
  { id: 'winnipeg-duluth', from: 'winnipeg', to: 'duluth', length: 4, color: 'black' },
  { id: 'winnipeg-sault-ste-marie', from: 'winnipeg', to: 'sault-ste-marie', length: 6, color: 'gray' },
  { id: 'duluth-sault-ste-marie', from: 'duluth', to: 'sault-ste-marie', length: 3, color: 'gray' },
  { id: 'duluth-toronto', from: 'duluth', to: 'toronto', length: 6, color: 'purple' },
  { id: 'duluth-chicago', from: 'duluth', to: 'chicago', length: 3, color: 'red' },
  { id: 'duluth-omaha-1', from: 'duluth', to: 'omaha', length: 2, color: 'gray', parallelGroup: 'duluth-omaha' },
  { id: 'duluth-omaha-2', from: 'duluth', to: 'omaha', length: 2, color: 'gray', parallelGroup: 'duluth-omaha' },
  { id: 'omaha-chicago', from: 'omaha', to: 'chicago', length: 4, color: 'blue' },
  { id: 'omaha-kansas-city-1', from: 'omaha', to: 'kansas-city', length: 1, color: 'gray', parallelGroup: 'omaha-kansas-city' },
  { id: 'omaha-kansas-city-2', from: 'omaha', to: 'kansas-city', length: 1, color: 'gray', parallelGroup: 'omaha-kansas-city' },
  { id: 'kansas-city-st-louis-1', from: 'kansas-city', to: 'st-louis', length: 2, color: 'blue', parallelGroup: 'kansas-city-st-louis' },
  { id: 'kansas-city-st-louis-2', from: 'kansas-city', to: 'st-louis', length: 2, color: 'purple', parallelGroup: 'kansas-city-st-louis' },
  { id: 'kansas-city-oklahoma-city-1', from: 'kansas-city', to: 'oklahoma-city', length: 2, color: 'gray', parallelGroup: 'kansas-city-oklahoma-city' },
  { id: 'kansas-city-oklahoma-city-2', from: 'kansas-city', to: 'oklahoma-city', length: 2, color: 'gray', parallelGroup: 'kansas-city-oklahoma-city' },
  { id: 'oklahoma-city-little-rock', from: 'oklahoma-city', to: 'little-rock', length: 2, color: 'gray' },
  { id: 'oklahoma-city-dallas-1', from: 'oklahoma-city', to: 'dallas', length: 2, color: 'gray', parallelGroup: 'oklahoma-city-dallas' },
  { id: 'oklahoma-city-dallas-2', from: 'oklahoma-city', to: 'dallas', length: 2, color: 'gray', parallelGroup: 'oklahoma-city-dallas' },
  { id: 'dallas-houston-1', from: 'dallas', to: 'houston', length: 1, color: 'gray', parallelGroup: 'dallas-houston' },
  { id: 'dallas-houston-2', from: 'dallas', to: 'houston', length: 1, color: 'gray', parallelGroup: 'dallas-houston' },
  { id: 'dallas-little-rock', from: 'dallas', to: 'little-rock', length: 2, color: 'gray' },
  { id: 'houston-new-orleans', from: 'houston', to: 'new-orleans', length: 2, color: 'gray' },
  { id: 'little-rock-new-orleans', from: 'little-rock', to: 'new-orleans', length: 3, color: 'green' },
  { id: 'little-rock-nashville', from: 'little-rock', to: 'nashville', length: 3, color: 'white' },
  { id: 'little-rock-st-louis', from: 'little-rock', to: 'st-louis', length: 2, color: 'gray' },
  { id: 'st-louis-chicago-1', from: 'st-louis', to: 'chicago', length: 2, color: 'green', parallelGroup: 'st-louis-chicago' },
  { id: 'st-louis-chicago-2', from: 'st-louis', to: 'chicago', length: 2, color: 'white', parallelGroup: 'st-louis-chicago' },
  { id: 'st-louis-pittsburgh', from: 'st-louis', to: 'pittsburgh', length: 5, color: 'green' },
  { id: 'st-louis-nashville', from: 'st-louis', to: 'nashville', length: 2, color: 'gray' },
  { id: 'chicago-pittsburgh-1', from: 'chicago', to: 'pittsburgh', length: 3, color: 'orange', parallelGroup: 'chicago-pittsburgh' },
  { id: 'chicago-pittsburgh-2', from: 'chicago', to: 'pittsburgh', length: 3, color: 'black', parallelGroup: 'chicago-pittsburgh' },
  { id: 'chicago-toronto', from: 'chicago', to: 'toronto', length: 4, color: 'white' },
  { id: 'sault-ste-marie-toronto', from: 'sault-ste-marie', to: 'toronto', length: 2, color: 'gray' },
  { id: 'sault-ste-marie-montreal', from: 'sault-ste-marie', to: 'montreal', length: 5, color: 'black' },
  { id: 'toronto-montreal', from: 'toronto', to: 'montreal', length: 3, color: 'gray' },
  { id: 'toronto-pittsburgh', from: 'toronto', to: 'pittsburgh', length: 2, color: 'gray' },
  { id: 'montreal-boston-1', from: 'montreal', to: 'boston', length: 2, color: 'gray', parallelGroup: 'montreal-boston' },
  { id: 'montreal-boston-2', from: 'montreal', to: 'boston', length: 2, color: 'gray', parallelGroup: 'montreal-boston' },
  { id: 'montreal-new-york', from: 'montreal', to: 'new-york', length: 3, color: 'blue' },
  { id: 'boston-new-york-1', from: 'boston', to: 'new-york', length: 2, color: 'yellow', parallelGroup: 'boston-new-york' },
  { id: 'boston-new-york-2', from: 'boston', to: 'new-york', length: 2, color: 'red', parallelGroup: 'boston-new-york' },
  { id: 'new-york-pittsburgh-1', from: 'new-york', to: 'pittsburgh', length: 2, color: 'white', parallelGroup: 'new-york-pittsburgh' },
  { id: 'new-york-pittsburgh-2', from: 'new-york', to: 'pittsburgh', length: 2, color: 'green', parallelGroup: 'new-york-pittsburgh' },
  { id: 'new-york-washington-1', from: 'new-york', to: 'washington', length: 2, color: 'orange', parallelGroup: 'new-york-washington' },
  { id: 'new-york-washington-2', from: 'new-york', to: 'washington', length: 2, color: 'black', parallelGroup: 'new-york-washington' },
  { id: 'pittsburgh-washington', from: 'pittsburgh', to: 'washington', length: 2, color: 'gray' },
  { id: 'pittsburgh-raleigh', from: 'pittsburgh', to: 'raleigh', length: 2, color: 'gray' },
  { id: 'pittsburgh-nashville', from: 'pittsburgh', to: 'nashville', length: 4, color: 'yellow' },
  { id: 'washington-raleigh-1', from: 'washington', to: 'raleigh', length: 2, color: 'gray', parallelGroup: 'washington-raleigh' },
  { id: 'washington-raleigh-2', from: 'washington', to: 'raleigh', length: 2, color: 'gray', parallelGroup: 'washington-raleigh' },
  { id: 'raleigh-nashville', from: 'raleigh', to: 'nashville', length: 3, color: 'black' },
  { id: 'raleigh-atlanta-1', from: 'raleigh', to: 'atlanta', length: 2, color: 'gray', parallelGroup: 'raleigh-atlanta' },
  { id: 'raleigh-atlanta-2', from: 'raleigh', to: 'atlanta', length: 2, color: 'gray', parallelGroup: 'raleigh-atlanta' },
  { id: 'raleigh-charleston', from: 'raleigh', to: 'charleston', length: 2, color: 'gray' },
  { id: 'nashville-atlanta', from: 'nashville', to: 'atlanta', length: 1, color: 'gray' },
  { id: 'atlanta-charleston', from: 'atlanta', to: 'charleston', length: 2, color: 'gray' },
  { id: 'charleston-miami', from: 'charleston', to: 'miami', length: 4, color: 'purple' },
  { id: 'atlanta-miami', from: 'atlanta', to: 'miami', length: 5, color: 'blue' },
  { id: 'atlanta-new-orleans-1', from: 'atlanta', to: 'new-orleans', length: 4, color: 'yellow', parallelGroup: 'atlanta-new-orleans' },
  { id: 'atlanta-new-orleans-2', from: 'atlanta', to: 'new-orleans', length: 4, color: 'orange', parallelGroup: 'atlanta-new-orleans' },
  { id: 'new-orleans-miami', from: 'new-orleans', to: 'miami', length: 6, color: 'red' },
];

export const TICKETS: Ticket[] = [
  { id: 'boston-miami', from: 'boston', to: 'miami', points: 12 },
  { id: 'calgary-phoenix', from: 'calgary', to: 'phoenix', points: 13 },
  { id: 'calgary-salt-lake-city', from: 'calgary', to: 'salt-lake-city', points: 7 },
  { id: 'chicago-new-orleans', from: 'chicago', to: 'new-orleans', points: 7 },
  { id: 'chicago-santa-fe', from: 'chicago', to: 'santa-fe', points: 9 },
  { id: 'dallas-new-york', from: 'dallas', to: 'new-york', points: 11 },
  { id: 'denver-el-paso', from: 'denver', to: 'el-paso', points: 4 },
  { id: 'denver-pittsburgh', from: 'denver', to: 'pittsburgh', points: 11 },
  { id: 'duluth-el-paso', from: 'duluth', to: 'el-paso', points: 10 },
  { id: 'duluth-houston', from: 'duluth', to: 'houston', points: 8 },
  { id: 'helena-los-angeles', from: 'helena', to: 'los-angeles', points: 8 },
  { id: 'kansas-city-houston', from: 'kansas-city', to: 'houston', points: 5 },
  { id: 'los-angeles-chicago', from: 'los-angeles', to: 'chicago', points: 16 },
  { id: 'los-angeles-miami', from: 'los-angeles', to: 'miami', points: 20 },
  { id: 'los-angeles-new-york', from: 'los-angeles', to: 'new-york', points: 21 },
  { id: 'montreal-atlanta', from: 'montreal', to: 'atlanta', points: 9 },
  { id: 'montreal-new-orleans', from: 'montreal', to: 'new-orleans', points: 13 },
  { id: 'new-york-atlanta', from: 'new-york', to: 'atlanta', points: 6 },
  { id: 'portland-nashville', from: 'portland', to: 'nashville', points: 17 },
  { id: 'portland-phoenix', from: 'portland', to: 'phoenix', points: 11 },
  { id: 'san-francisco-atlanta', from: 'san-francisco', to: 'atlanta', points: 17 },
  { id: 'sault-ste-marie-nashville', from: 'sault-ste-marie', to: 'nashville', points: 8 },
  { id: 'sault-ste-marie-oklahoma-city', from: 'sault-ste-marie', to: 'oklahoma-city', points: 9 },
  { id: 'seattle-los-angeles', from: 'seattle', to: 'los-angeles', points: 9 },
  { id: 'seattle-new-york', from: 'seattle', to: 'new-york', points: 22 },
  { id: 'toronto-miami', from: 'toronto', to: 'miami', points: 10 },
  { id: 'vancouver-montreal', from: 'vancouver', to: 'montreal', points: 20 },
  { id: 'vancouver-santa-fe', from: 'vancouver', to: 'santa-fe', points: 13 },
  { id: 'winnipeg-houston', from: 'winnipeg', to: 'houston', points: 12 },
  { id: 'winnipeg-little-rock', from: 'winnipeg', to: 'little-rock', points: 11 },
];
