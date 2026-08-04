export type CareerStop = {
  club: string;
  seasons: string;
  appearances?: number;
  goals?: number;
};

export type Achievement = {
  title: string;
  count: number;
};

export type Player = {
  id: string;
  name: string;
  nationality: string;
  careerPath: CareerStop[];
  achievements?: Achievement[];
};

export type PhotoPlayer = {
  id: string;
  name: string;
  nationality: string;
  imageUrl: string;
};
