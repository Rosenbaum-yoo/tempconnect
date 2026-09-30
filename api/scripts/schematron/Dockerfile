# Der EN-16931-Pruefstand: KoSIT-Validator mit der XRechnung-Konfiguration.
#
# WARUM EIN EIGENES ABBILD
# Es gibt kein offizielles KoSIT-Docker-Abbild. Das einzige gepflegte
# Fremdabbild laeuft als HTTP-Daemon — das passt nicht zu einem Gate, das wie
# `docker run verapdf/cli` einmal aufgerufen wird und ein Ergebnis liefert.
# Hier also selbst gebaut: ein JRE, das JAR, die Konfiguration, fertig.
#
# WARUM DIE ARTEFAKTE NICHT IM REPO LIEGEN
# Das JAR ist 10 MB, die Konfiguration 0,5 MB. Beide kommen aus offiziellen
# GitHub-Releases und sind ueber ihre Pruefsummen festgenagelt. Ein
# stillschweigend anderes JAR faellt beim Bau auf, nicht erst im Ergebnis.
#
# WARUM UNTER api/scripts/
# api/.dockerignore schliesst `scripts/` vom PRODUKTIONSABBILD aus. Unter
# api/assets/ waere es falsch: dieses Verzeichnis ist bewusst NICHT
# ausgeschlossen (die PDF/A-Schriften werden zur Laufzeit gebraucht), und ein
# 10-MB-Pruefwerkzeug landete still in der Auslieferung.
#
# Bauen und fahren erledigt api/scripts/schematron.mjs — von Hand:
#   docker build -t tempconnect/en16931:1.6.3-2026-01-31 api/scripts/schematron
#   docker run --rm -v "<verzeichnis>:/data" tempconnect/en16931:1.6.3-2026-01-31 -o /data /data/rechnung.xml

FROM eclipse-temurin:21-jre-alpine

# Alle drei Versionsachsen gepinnt, nie `latest`: eine stillschweigend neuere
# Regelfassung wuerde das Gate ohne Codeaenderung rot oder gruen faerben.
ARG VALIDATOR_VERSION=1.6.3
ARG CONFIG_TAG=v2026-01-31
ARG CONFIG_FILE=xrechnung-3.0.2-validator-configuration-2026-01-31.zip
ARG VALIDATOR_SHA256=799e64befca97d4080e03608c80b85dd5a5ecc5f4ae4f35d1116ec2855b9a7c9
ARG CONFIG_SHA256=6a5a5911a421b25fbc423f62f93f894df7b236f5d73ca4f84bb222a945082704

RUN apk add --no-cache curl unzip

WORKDIR /opt

RUN curl -sSL -o validator.jar \
      "https://github.com/itplr-kosit/validator/releases/download/v${VALIDATOR_VERSION}/validator-${VALIDATOR_VERSION}-standalone.jar" \
 && echo "${VALIDATOR_SHA256}  validator.jar" | sha256sum -c - \
 && curl -sSL -o config.zip \
      "https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/download/${CONFIG_TAG}/${CONFIG_FILE}" \
 && echo "${CONFIG_SHA256}  config.zip" | sha256sum -c - \
 && mkdir -p /opt/config \
 && unzip -q config.zip -d /opt/config \
 && rm config.zip \
 && apk del curl unzip

# Der Aufrufer haengt nur noch Optionen und Dateien an. `-s` und `-r` stehen
# hier, damit kein Aufrufer sie vergessen kann — ohne `-r` findet der Validator
# seine Regeldateien nicht.
ENTRYPOINT ["java", "-jar", "/opt/validator.jar", "-s", "/opt/config/scenarios.xml", "-r", "/opt/config"]
