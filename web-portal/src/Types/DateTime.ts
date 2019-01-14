export class DateTime {
    private readonly date: Date;

    public constructor(value?: number) {
        if (!value) {
            value = new Date().getTime();
        }

        this.date = new Date(value);
    }

    public AsSeconds(): number {
        return this.date.getTime() / 1000;
    }

    public AddMilliseconds(milliseconds: number): DateTime {
        return new DateTime(this.date.getTime() + milliseconds);
    }

    public AddSeconds(seconds: number): DateTime {
        return this.AddMilliseconds(seconds * 1000);
    }

    public AddMinutes(minutes: number): DateTime {
        return this.AddSeconds(minutes * 60);
    }

    public AddHours(hours: number): DateTime {
        return this.AddMinutes(hours * 60);
    }

    public AddDays(days: number): DateTime {
        return this.AddHours(days * 24);
    }
}
