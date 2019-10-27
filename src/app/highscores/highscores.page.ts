import { Component, OnInit } from '@angular/core';
import { of, Observable } from 'rxjs';
import { AngularFirestore } from '@angular/fire/firestore';
import { map } from 'rxjs/operators';

export interface Highscore {
  playerName: string;
  shots: number;
  kills: number;
}

@Component({
  selector: 'app-highscores',
  templateUrl: './highscores.page.html',
  styleUrls: ['./highscores.page.scss'],
})
export class HighscoresPage implements OnInit {

  public highscores$: Observable<Highscore[]> = this.angularFirestore.collection('highscore').valueChanges().pipe(
    map(value => value as Highscore[])
  );

  constructor(private angularFirestore: AngularFirestore) { }

  ngOnInit() {
  }

}
