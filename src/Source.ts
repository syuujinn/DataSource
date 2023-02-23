import { Observable, Subscriber, Subject } from 'rxjs';
import { Client, Message } from 'paho-mqtt';

// 資料來源的類別定義區塊
// 資料來源有
// 靜態 (Static) 來源可能固定 或是 API
// 動態串流 ( Stream ) 有 webscoket、mqtt 與 video stream


export namespace Source {

    export abstract class Base {
        protected _name: string;
        private _subject: Subject<any>;
        private _clients: { [key: string]: any } = {};
        private _data_type: string = "number";
        private _active: boolean = true;

        protected _value: any = null;

        public get value(): any { return this._value; }
        public set value(val: any) { this._value = val; }

        public get active(): boolean { return this._active; }
        public set active(val: boolean) {
            this._active = val;
            if (this._active) this.update();
        }

        public get data_type(): string { return this._data_type; }
        public set data_type(val: string) { this._data_type = val; }

        public get clients(): { [key: string]: any } { return this._clients; }
        public set clients(val: { [key: string]: any }) { this._clients = val; }

        public get observable(): Observable<any> {
            return this._subject.asObservable();
        }

        constructor(name: string, data_type: string = "number") {
            this._name = name;
            this._data_type = data_type;
            this._subject = new Subject();
            this._subject.asObservable().subscribe((value) => {
                for (let key in this._clients) {
                    this.send(this._clients[key], value);
                }
            });
        }

        private send(client: any, value: any) {

            if (typeof (client) === 'function') {

                if (this._data_type.toLocaleLowerCase() === "number")
                    value = parseFloat(value);
                client(value);
            }
        }

        public next(value: any) {
            this._subject.next(value);
        }

        public add(name: string, client: any): boolean {
            let result = false;
            if (!(name in this._clients)) {
                this._clients[name] = client;
                if (this._value !== null) {
                    this.send(client, this._value);
                }
                result = true;
            } else {
                console.log('Source', this._name, 'add', name, 'fail');
            }
            return result;
        };

        public remove(name: string): boolean {
            let result = false;

            if (name in this._clients) {
                delete this._clients[name];
                result = true;
            }
            else {
                console.log('Source', this._name, 'remove', name, 'fail');
            }
            return result;
        }

        public abstract update(): void;
    }

    export class Static extends Base {

        constructor(name: string, data_type: string = "number", value: string | number = "") {
            super(name, data_type);
            this._value = value;
            this.update();
        }

        public update() {
            this.next(this._value);
            setTimeout(() => {
                if (this.active) {
                    this.update();
                }
            }, 1000);
        }
    }

    export class API extends Base {

        private _ticker: number = 5000;
        private _url: string = "";

        public get url(): string { return this._url; }
        public set url(val: string) { this._url = val; }

        public get ticker(): number { return this._ticker; }
        public set ticker(val: number) { this._ticker = val; }
        constructor(name: string, data_type: string = "number", url: string = "", ticker: number = 5000) {
            super(name, data_type);
            this._url = url;
            this._ticker = ticker;
            this.update();
        }

        public update() {
            fetch(this._url).then(res => res.text()).then((data) => {
                this.next(data);
            }).finally(() => {
                setTimeout(() => {
                    if (this.active) {
                        this.update();
                    }
                }, this._ticker);
            });
        }

        // public 
    }

    export class MQTT extends Base {

        private _mqtt_client: Client = null;
        private _port: number = 8088;
        private _host: string = "";
        private _topic: string = "";

        public get topic(): string{ return this._topic; }
        public set topic(val: string){ this._topic = val; }

        public get host(): string{ return this._host; }
        public set host(val: string){ this._host = val; }

        public get port(): number{ return this._port; }
        public set port(val: number){ this._port = val; }

        public get mqtt_client(): Client{ return this._mqtt_client; }
        public set mqtt_client(val: Client){ this._mqtt_client = val; }

        constructor(name: string, data_type: string = "number", host: string = "", port: number = 8088, topic: string = "") {
            super(name, data_type);
            this._host = host;
            this._port = port;
            this._topic = topic;
            this._mqtt_client = new Client(this._host, this._port, `clientid_${ name }`);

            this._mqtt_client.connect({
                'timeout': 3,    /* if conection not successfull within 3 seconds, it is deemed to have failed */
                // 'userName': sensor.username,
                // 'password': sensor.password,
                'keepAliveInterval': 30,
                // 'useSSL': environment.mqtt.useSSL,
                'onSuccess': () => {
                    this._mqtt_client.subscribe(this._topic, { qos: 0 });                    
                },
                'onFailure': (message: any) => {
                    console.log("Connection faild, Error: " + message.errorMessage);
                }
            });
            this._mqtt_client.onConnectionLost = (responseObject: any) => {

                console.log("Connection lost: " + responseObject.errorMessage);
            }                

            this._mqtt_client.onMessageArrived = (message: any) => {
                let msg = message.payloadString;     
                this._value = msg;
                this.next(msg);
                console.log("Message arrived: " + msg);           
            }
        }

        public update() {}
        // device.client = new Client(environment.mqtt.host, environment.mqtt.port, "clientid_" + Utils.generateSerial());
    }
}

