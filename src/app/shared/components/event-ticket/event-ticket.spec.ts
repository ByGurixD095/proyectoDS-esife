import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EventTicket } from './event-ticket';

describe('EventTicket', () => {
  let component: EventTicket;
  let fixture: ComponentFixture<EventTicket>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventTicket]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EventTicket);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
